import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autamedica/types";
import { logger } from "@autamedica/shared";
import { createAstroAdminClient } from "@/lib/supabase";
import { readAllPages, reconcileProfiles } from "@/lib/growth/dashboard-reconciliation";

export const prerender = false;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

type RuntimeEnv = Record<string, unknown> | null | undefined;
type QueryError = { message: string };
type QueryResponse<T> = { data: T | null; error: QueryError | null };
type QueryChain<T> = PromiseLike<QueryResponse<T>> & {
  eq(column: string, value: string): QueryChain<T>;
  gte(column: string, value: string): QueryChain<T>;
  ilike(column: string, pattern: string): QueryChain<T>;
  neq(column: string, value: string): QueryChain<T>;
  or(filters: string): QueryChain<T>;
  range(from: number, to: number): QueryChain<T>;
  not(column: string, operator: string, value: string): QueryChain<T>;
  order(column: string, options?: { ascending?: boolean }): QueryChain<T>;
  limit(count: number): QueryChain<T>;
};
type CountQueryChain = PromiseLike<{
  count: number | null;
  error: QueryError | null;
}> & {
  eq(column: string, value: string): CountQueryChain;
  gte(column: string, value: string): CountQueryChain;
  ilike(column: string, pattern: string): CountQueryChain;
};
type GrowthSchemaClient = {
  rpc<T>(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<QueryResponse<T>>;
  from<Row>(table: string): {
    select(columns: string): QueryChain<Row[]>;
    select(
      columns: string,
      options: { count: "exact"; head: true },
    ): CountQueryChain;
  };
};
type DashboardSummary = {
  period_days: number;
  total_leads: number;
  leads_by_vertical: Record<string, number>;
  leads_by_utm_source: Record<string, number>;
  leads_by_day: Array<{ date: string; count: number }>;
  emails_sent: number;
  emails_by_type: Record<string, number>;
  conversions: {
    lead_to_appointment: number;
    lead_to_revenue: number;
    total_revenue: number;
  };
};
type RecentLeadRow = {
  id: string;
  email: string;
  name: string | null;
  vertical: string;
  intent: string | null;
  first_utm_source: string | null;
  first_utm_medium: string | null;
  first_utm_campaign: string | null;
  status: string;
  created_at: string;
};
type LeadMetricRow = {
  email: string;
  vertical: string | null;
  first_utm_source: string | null;
  created_at: string;
};
type EmailJobRow = {
  id: string;
  job_type: string;
  recipient_email: string;
  status: string;
  sent_at: string | null;
  created_at: string;
};
type NurturingSequenceRow = {
  id: string;
  name: string;
  vertical: string | null;
  enabled: boolean;
};
type NewsletterEditionRow = {
  id: string;
  edition_date: string;
  subject: string;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
};
type EmailEventRow = {
  id: number;
  provider: string;
  event_type: string;
  message_id: string | null;
  broadcast_id: string | null;
  subject: string | null;
  received_at: string;
};
type ProfileSignupRow = {
  user_id: string;
  email: string | null;
  role: string | null;
  newsletter_subscribed: boolean | null;
  created_at: string;
};
type LeadAttributionRow = {
  lead_id: string;
  lead_email: string;
  vertical: string | null;
  first_utm_source: string | null;
  converted_to_appointment: boolean;
  converted_to_revenue: boolean;
  payment_amount: number | null;
  hours_to_appointment: number | null;
};

function readEnv(runtimeEnv: RuntimeEnv, key: string): string {
  const runtimeValue = runtimeEnv?.[key];
  if (typeof runtimeValue === "string" && runtimeValue.length > 0)
    return runtimeValue;
  const importValue = import.meta.env[key];
  return typeof importValue === "string" ? importValue : "";
}

function isLocalDevBypass(request: Request): boolean {
  const url = new URL(request.url);
  return (
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.searchParams.get("dev_admin") === "1"
  );
}

const ADMIN_ROLES = ["admin", "organization_admin", "platform_admin"] as const;

function getMetadataRole(user: App.Locals["session"]["user"] | undefined): string | undefined {
  const appRole = (user?.app_metadata as Record<string, unknown> | undefined)?.role;
  return typeof appRole === "string" ? appRole : undefined;
}

async function isAuthorized(
  locals: App.Locals,
  request: Request,
  runtimeEnv: RuntimeEnv,
): Promise<boolean> {
  if (isLocalDevBypass(request)) return true;

  // Check session first (for admin UI)
  const user = locals.session?.user;
  const role = getMetadataRole(user);
  if (role && ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) return true;

  if (user?.id) {
    try {
      const admin = createAstroAdminClient(runtimeEnv);
      const { data } = await admin
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        data?.role &&
        ADMIN_ROLES.includes(data.role as (typeof ADMIN_ROLES)[number])
      ) {
        return true;
      }
    } catch (e) {
      logger.error("[growth/dashboard] Failed db role check in authorization", e);
    }
  }

  // Check secret (for cron/internal)
  const secret =
    readEnv(runtimeEnv, "CRON_SECRET") || readEnv(runtimeEnv, "TRIGGER_KEY");
  if (!secret) return false;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const triggerKey = request.headers.get("x-trigger-key");
  return bearer === secret || triggerKey === secret;
}

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function centsToMajorUnit(value: number | string | null | undefined): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

function normalizeSummary(
  summary: DashboardSummary | null,
): DashboardSummary | null {
  if (!summary) return summary;

  return {
    ...summary,
    leads_by_vertical: summary.leads_by_vertical ?? {},
    leads_by_utm_source: summary.leads_by_utm_source ?? {},
    leads_by_day: summary.leads_by_day ?? [],
    emails_by_type: summary.emails_by_type ?? {},
    conversions: {
      ...summary.conversions,
      total_revenue: centsToMajorUnit(summary.conversions.total_revenue),
    },
  };
}

function countByKey<T>(
  rows: T[],
  key: (row: T) => string,
): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = key(row);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function activeLeadSummary(
  rows: LeadMetricRow[],
): Pick<
  DashboardSummary,
  "total_leads" | "leads_by_vertical" | "leads_by_utm_source" | "leads_by_day"
> {
  const byDate = countByKey(rows, (row) => row.created_at.slice(0, 10));
  return {
    total_leads: rows.length,
    leads_by_vertical: countByKey(rows, (row) => row.vertical ?? "general"),
    leads_by_utm_source: countByKey(
      rows,
      (row) => row.first_utm_source ?? "unknown",
    ),
    leads_by_day: Object.entries(byDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => ({ date, count })),
  };
}

async function exactEmailEventCount(
  growth: GrowthSchemaClient,
  eventType: string,
  since: string,
  newsletterOnly = true,
): Promise<number> {
  let query = growth
    .from<EmailEventRow>("email_events")
    .select("*", { count: "exact", head: true })
    .eq("provider", "resend")
    .eq("event_type", eventType)
    .gte("received_at", since);
  if (newsletterOnly) query = query.ilike("subject", "%Salud Digital%");
  const { count, error } = await query;

  if (error) throw new Error(error.message);
  return count ?? 0;
}

function normalizeAttribution(
  rows: LeadAttributionRow[] | null,
): LeadAttributionRow[] {
  return (rows ?? []).map((row) => ({
    ...row,
    payment_amount:
      row.payment_amount === null ? null : centsToMajorUnit(row.payment_amount),
  }));
}
export const GET: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (!(await isAuthorized(locals, request, runtimeEnv))) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") || "30"), 1),
    365,
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const admin = createAstroAdminClient(
      runtimeEnv,
    ) as unknown as SupabaseClient<Database>;
    const growth = (admin as unknown as { schema(name: string): GrowthSchemaClient }).schema("growth_os");

    const { data, error } = await growth.rpc<DashboardSummary>(
      "dashboard_summary",
      { days_back: days },
    );

    if (error) throw new Error(error.message);

    const [
      profilesCountResult,
      newsletterProfilesCountResult,
      profilesListResult,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since)
        .eq("newsletter_subscribed", true),
      admin
        .from("profiles")
        .select("user_id, email, role, newsletter_subscribed, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const [profileIdentities, leadIdentities] = await Promise.all([
      readAllPages<{ user_id: string; email: string | null }>((from, to) =>
        admin.from("profiles").select("user_id, email")
          .gte("created_at", since).order("user_id").range(from, to)),
      readAllPages<{ email: string | null }>((from, to) =>
        growth.from<{ email: string | null }>("leads").select("email")
          .order("id").range(from, to)),
    ]);
    const reconciliation = reconcileProfiles(profileIdentities, leadIdentities);
    const recentProfiles = profilesListResult.data ?? [];
    if (
      profilesCountResult.error ||
      newsletterProfilesCountResult.error ||
      profilesListResult.error
    ) {
      logger.error(
        "[growth/dashboard] Failed to fetch Supabase profile signup metrics",
        {
          profilesCountError: profilesCountResult.error,
          newsletterProfilesCountError: newsletterProfilesCountResult.error,
          profilesListError: profilesListResult.error,
        },
      );
    }

    // Also fetch active leads for tables and counters.
    // Unsubscribed contacts are kept for traceability but are not active acquisition.
    const { data: activeLeads, error: activeLeadsError } = await growth
      .from<LeadMetricRow>("leads")
      .select("email, vertical, first_utm_source, created_at")
      .gte("created_at", since)
      .neq("status", "unsubscribed")
      .or("first_utm_source.is.null,first_utm_source.neq.codex")
      .not("email", "ilike", "%@autamedica.test")
      .limit(5000);

    if (activeLeadsError) throw new Error(activeLeadsError.message);

    // Also fetch recent leads for the table
    const { data: recentLeads, error: leadsError } = await growth
      .from<RecentLeadRow>("leads")
      .select(
        "id, email, name, vertical, intent, first_utm_source, first_utm_medium, first_utm_campaign, status, created_at",
      )
      .gte("created_at", since)
      .neq("status", "unsubscribed")
      .or("first_utm_source.is.null,first_utm_source.neq.codex")
      .not("email", "ilike", "%@autamedica.test")
      .order("created_at", { ascending: false })
      .limit(50);

    if (leadsError) {
      logger.error("[growth/dashboard] Failed to fetch recent leads", {
        error: leadsError,
      });
    }

    // Fetch email job stats
    const { data: emailStats, error: emailError } = await growth
      .from<EmailJobRow>("email_jobs")
      .select("id, job_type, recipient_email, status, sent_at, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);

    if (emailError) {
      logger.error("[growth/dashboard] Failed to fetch email stats", {
        error: emailError,
      });
    }

    // Fetch nurturing sequence status
    const { data: sequences, error: seqError } = await growth
      .from<NurturingSequenceRow>("nurturing_sequences")
      .select("id, name, vertical, enabled");

    if (seqError) {
      logger.error("[growth/dashboard] Failed to fetch nurturing sequences", {
        error: seqError,
      });
    }

    // Fetch newsletter/broadcast state. Newsletter is sent via Resend Broadcasts,
    // not via growth_os.email_jobs. Keep it separate from transactional jobs.
    const { data: newsletterEditions, error: newsletterError } = await growth
      .from<NewsletterEditionRow>("newsletter_editions")
      .select(
        "id, edition_date, subject, status, provider, provider_message_id, sent_at, error_message, created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);

    if (newsletterError) {
      logger.error("[growth/dashboard] Failed to fetch newsletter editions", {
        error: newsletterError,
      });
    }

    const { data: emailEvents, error: eventsError } = await growth
      .from<EmailEventRow>("email_events")
      .select(
        "id, provider, event_type, message_id, broadcast_id, subject, received_at",
      )
      .eq("provider", "resend")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(500);

    if (eventsError) {
      logger.error("[growth/dashboard] Failed to fetch email events", {
        error: eventsError,
      });
    }

    const newsletterRows = newsletterEditions ?? [];
    const eventRows = emailEvents ?? [];
    const [
      newsletterSent,
      newsletterDelivered,
      newsletterBounced,
      newsletterDelayed,
      newsletterOpened,
      newsletterClicked,
      allEmailSent,
      allEmailDelivered,
      allEmailClicked,
    ] = await Promise.all([
      exactEmailEventCount(growth, "email.sent", since),
      exactEmailEventCount(growth, "email.delivered", since),
      exactEmailEventCount(growth, "email.bounced", since),
      exactEmailEventCount(growth, "email.delivery_delayed", since),
      exactEmailEventCount(growth, "email.opened", since),
      exactEmailEventCount(growth, "email.clicked", since),
      exactEmailEventCount(growth, "email.sent", since, false),
      exactEmailEventCount(growth, "email.delivered", since, false),
      exactEmailEventCount(growth, "email.clicked", since, false),
    ]);
    const resendEvents = eventRows.filter(
      (event) => event.provider === "resend",
    );
    const newsletterResendEvents = resendEvents.filter((event) =>
      (event.subject ?? "").toLowerCase().includes("salud digital"),
    );
    const resendEventCounts = newsletterResendEvents.reduce<
      Record<string, number>
    >((counts, event) => {
      counts[event.event_type] = (counts[event.event_type] ?? 0) + 1;
      return counts;
    }, {});

    // Fetch attribution data
    const { data: attribution, error: attrError } = await growth
      .from<LeadAttributionRow>("lead_attribution")
      .select(
        "lead_id, lead_email, vertical, first_utm_source, converted_to_appointment, converted_to_revenue, payment_amount, hours_to_appointment, lead_created_at",
      )
      .gte("lead_created_at", since)
      .limit(200);

    if (attrError) {
      logger.error("[growth/dashboard] Failed to fetch attribution data", {
        error: attrError,
      });
    }

    const summary = normalizeSummary(data);
    const activeSummary = activeLeadSummary(activeLeads ?? []);

    return json({
      summary: summary
        ? {
            ...summary,
            ...activeSummary,
          }
        : summary,
      supabase_signups: {
        source: "public.profiles",
        profiles_created: profilesCountResult.count ?? 0,
        newsletter_subscribed: newsletterProfilesCountResult.count ?? 0,
        reconciliation: {
          source: "normalized_email_all_growth_leads",
          profiles_checked: reconciliation.profiles_checked,
          matched_profiles: reconciliation.matched_profiles,
          unmatched_profiles: reconciliation.unmatched_profiles,
          profiles_without_email: reconciliation.profiles_without_email,
        },
        recent_profiles: (recentProfiles as ProfileSignupRow[]).map((profile) => ({
          ...profile,
          growth_lead_match: reconciliation.matches.get(profile.user_id) ?? "unknown",
        })),
      },
      recent_leads: recentLeads ?? [],
      email_jobs: emailStats ?? [],
      nurturing_sequences: sequences ?? [],
      resend: {
        source: "growth_os.email_events; provider=resend; all subjects",
        sent_events: allEmailSent,
        delivered_events: allEmailDelivered,
        clicked_events: allEmailClicked,
        last_event_at: eventsError ? null : resendEvents[0]?.received_at ?? null,
      },
      newsletter: {
        source: "newsletter_editions + Resend newsletter email_events",
        sent_broadcasts: newsletterRows.filter(
          (edition) =>
            edition.status === "sent" && edition.provider === "resend",
        ).length,
        failed_broadcasts: newsletterRows.filter(
          (edition) => edition.status === "failed",
        ).length,
        draft_broadcasts: newsletterRows.filter(
          (edition) => edition.status === "draft",
        ).length,
        sent_emails: newsletterSent,
        delivered_emails: newsletterDelivered,
        bounced_emails: newsletterBounced,
        delayed_emails: newsletterDelayed,
        opened_emails: newsletterOpened,
        clicked_emails: newsletterClicked,
        last_event_at: newsletterResendEvents[0]?.received_at ?? null,
        last_sent_at:
          newsletterRows.find((edition) => edition.status === "sent")
            ?.sent_at ?? null,
        resend_events: {
          ...resendEventCounts,
          "email.sent": newsletterSent,
          "email.delivered": newsletterDelivered,
          "email.bounced": newsletterBounced,
          "email.delivery_delayed": newsletterDelayed,
          "email.opened": newsletterOpened,
          "email.clicked": newsletterClicked,
        },
        recent_editions: newsletterRows.slice(0, 10),
      },
      attribution: normalizeAttribution(attribution),
    });
  } catch (err) {
    logger.error("[growth/dashboard] Failed to generate dashboard", err);
    return json({ error: "dashboard_failed" }, 500);
  }
};

