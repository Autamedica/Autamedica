import type { APIRoute } from "astro";
import { logger } from "@autamedica/shared";
import { createAstroAdminClient } from "@/lib/supabase";

export const prerender = false;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

type RuntimeEnv = Record<string, unknown> | null | undefined;
type QueryError = { message: string };
type QueryResponse<T> = { data: T | null; error: QueryError | null };
type QueryChain<T> = PromiseLike<QueryResponse<T>> & {
  gte(column: string, value: string): QueryChain<T>;
  neq(column: string, value: string): QueryChain<T>;
  or(filters: string): QueryChain<T>;
  not(column: string, operator: string, value: string): QueryChain<T>;
  order(column: string, options?: { ascending?: boolean }): QueryChain<T>;
};
type GrowthSchemaClient = {
  from<Row>(table: string): {
    select(columns: string): QueryChain<Row[]>;
  };
};
type LeadAttributionRow = {
  lead_id: string;
  lead_email?: string | null;
  first_utm_source: string | null;
  first_utm_campaign: string | null;
  converted_to_appointment: boolean;
  converted_to_revenue: boolean;
  payment_amount: number | string | null;
  lead_created_at: string;
};
type AdSpendRow = {
  id: string;
  spend_date: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  amount: number | string;
  currency: string;
};
type SourceStats = {
  source: string;
  leads: number;
  appointments: number;
  revenue: number;
  spend: number;
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
      logger.error("[growth/cac] Failed db role check in authorization", e);
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

function centsToMajorUnit(value: number | string | null): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
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
  const sinceDate = since.slice(0, 10);

  try {
    const admin = createAstroAdminClient(runtimeEnv);
    const growth = (admin as unknown as { schema(name: string): GrowthSchemaClient }).schema("growth_os");

    const { data: attribution, error: attrError } = await growth
      .from<LeadAttributionRow>("lead_attribution")
      .select(
        "lead_id, lead_email, first_utm_source, first_utm_campaign, converted_to_appointment, converted_to_revenue, payment_amount, lead_created_at, lead_status",
      )
      .gte("lead_created_at", since)
      .neq("lead_status", "unsubscribed")
      .or("first_utm_source.is.null,first_utm_source.neq.codex")
      .not("lead_email", "ilike", "%@autamedica.test");

    if (attrError) throw attrError;

    const { data: spendRows, error: spendError } = await growth
      .from<AdSpendRow>("ad_spend")
      .select("id, spend_date, source, medium, campaign, amount, currency")
      .gte("spend_date", sinceDate)
      .order("spend_date", { ascending: false });

    if (spendError) throw spendError;

    const statsBySource: Record<string, SourceStats> = {};

    attribution?.forEach((lead) => {
      const source = lead.first_utm_source || "unknown";
      if (!statsBySource[source]) {
        statsBySource[source] = {
          source,
          leads: 0,
          appointments: 0,
          revenue: 0,
          spend: 0,
        };
      }

      statsBySource[source].leads++;
      if (lead.converted_to_appointment) statsBySource[source].appointments++;
      if (lead.converted_to_revenue)
        statsBySource[source].revenue += centsToMajorUnit(lead.payment_amount);
    });

    spendRows?.forEach((row) => {
      const source = row.source || "direct";
      if (!statsBySource[source]) {
        statsBySource[source] = {
          source,
          leads: 0,
          appointments: 0,
          revenue: 0,
          spend: 0,
        };
      }
      statsBySource[source].spend += Number(row.amount || 0);
    });

    const result = Object.values(statsBySource).map((s) => {
      const cac = s.leads > 0 ? s.spend / s.leads : 0;
      const cac_per_appointment =
        s.appointments > 0 ? s.spend / s.appointments : 0;
      const margin = s.revenue - s.spend;
      const roas = s.spend > 0 ? s.revenue / s.spend : 0;

      return {
        ...s,
        cac,
        cac_per_appointment,
        margin,
        roas,
      };
    });

    return new Response(
      JSON.stringify({
        period_days: days,
        stats: result,
        total_spend: result.reduce((a, b) => a + b.spend, 0),
        total_revenue: result.reduce((a, b) => a + b.revenue, 0),
        total_margin: result.reduce((a, b) => a + b.margin, 0),
        spend_rows: spendRows?.length ?? 0,
        spend_source: "growth_os.ad_spend",
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (err) {
    logger.error("[growth/cac] Failed to calculate CAC", err);
    return new Response(JSON.stringify({ error: "cac_calculation_failed" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

