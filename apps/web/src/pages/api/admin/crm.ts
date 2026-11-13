import type { APIRoute } from "astro";
import { createAstroAdminClient } from "@/lib/supabase";

export const prerender = false;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

type DbError = { message: string };
type ProfileRoleRow = { role?: string | null };
type CrmAccountRow = {
  id: string;
  name: string;
  account_type: string;
  status: string;
  main_phone_e164: string | null;
  main_email: string | null;
  whatsapp_url: string | null;
  address: string | null;
  city: string | null;
  website: string | null;
  priority: number;
  score: number;
  tags: string[] | null;
  last_contacted_at: string | null;
  next_action_at: string | null;
  created_at: string;
};

type SelectResult<T> = { data: T[] | null; error: DbError | null; count: number | null };
type MutationResult = { error: DbError | null };

type ProfileRoleClient = {
  from(table: "profiles"): {
    select(columns: "role"): {
      eq(column: "user_id", value: string): {
        maybeSingle(): Promise<{ data: ProfileRoleRow | null }>;
      };
    };
  };
};

type CrmSelectQuery<T> = PromiseLike<SelectResult<T>> & {
  order(column: string, options?: { ascending?: boolean }): CrmSelectQuery<T>;
  limit(count: number): CrmSelectQuery<T>;
  eq(column: string, value: string): CrmSelectQuery<T>;
  ilike(column: string, pattern: string): CrmSelectQuery<T>;
};

type CrmSchemaClient = {
  from(table: "crm_accounts"): {
    select(columns: string, options?: { count?: "exact" }): CrmSelectQuery<CrmAccountRow>;
    update(values: Record<string, unknown>): {
      eq(column: "id", value: string): Promise<MutationResult>;
    };
  };
  from(table: "crm_activities"): {
    insert(values: Record<string, unknown>): Promise<MutationResult>;
  };
};

type CrmAdminClient = ProfileRoleClient & {
  schema(schema: "growth_os"): CrmSchemaClient;
};

function isLocalDevBypass(request: Request): boolean {
  const url = new URL(request.url);
  return (
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1"].includes(url.hostname)
  );
}

const ADMIN_ROLES = ["admin", "organization_admin", "platform_admin"] as const;

function getMetadataRole(user: App.Locals["session"]["user"] | undefined): string | undefined {
  const appRole = (user?.app_metadata as Record<string, unknown> | undefined)?.role;
  return typeof appRole === "string" ? appRole : undefined;
}

async function isAuthorized(locals: App.Locals, request: Request): Promise<boolean> {
  if (isLocalDevBypass(request)) return true;
  const user = locals.session?.user;
  const role = getMetadataRole(user);
  if (role && ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) return true;
  if (!user?.id) return false;

  const admin = createAstroAdminClient(locals.runtime?.env) as unknown as CrmAdminClient;
  const { data } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return typeof data?.role === "string" && ADMIN_ROLES.includes(data.role as (typeof ADMIN_ROLES)[number]);
}

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export const GET: APIRoute = async ({ request, locals }) => {
  if (!(await isAuthorized(locals, request))) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "prospect";
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 250);
  const admin = createAstroAdminClient(locals.runtime?.env) as unknown as CrmAdminClient;

  let query = admin
    .schema("growth_os")
    .from("crm_accounts")
    .select(
      "id,name,account_type,status,main_phone_e164,main_email,whatsapp_url,address,city,website,priority,score,tags,last_contacted_at,next_action_at,created_at",
      { count: "exact" },
    )
    .order("priority", { ascending: false })
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.ilike("name", `%${q}%`);

  const [{ data: accounts, error, count }, statsResult] = await Promise.all([
    query,
    admin
      .schema("growth_os")
      .from("crm_accounts")
      .select("status", { count: "exact" }),
  ]);

  if (error) return json({ error: error.message }, 500);

  const statusCounts = (statsResult.data || []).reduce((acc: Record<string, number>, row: { status: string }) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  return json({ accounts: accounts || [], count: count || 0, status_counts: statusCounts });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await isAuthorized(locals, request))) return json({ error: "unauthorized" }, 401);

  const body = await request.json().catch(() => null) as {
    account_id?: string;
    status?: string;
    outcome?: string;
    note?: string;
    next_action_at?: string | null;
  } | null;
  if (!body?.account_id) return json({ error: "account_id_required" }, 400);

  const admin = createAstroAdminClient(locals.runtime?.env) as unknown as CrmAdminClient;
  const completedAt = new Date().toISOString();
  const status = body.status || (body.outcome === "do_not_contact" ? "do_not_contact" : undefined);

  const updates: Record<string, unknown> = {
    last_contacted_at: completedAt,
  };
  if (status) updates.status = status;
  if (body.next_action_at !== undefined) updates.next_action_at = body.next_action_at;

  const { error: updateError } = await admin
    .schema("growth_os")
    .from("crm_accounts")
    .update(updates)
    .eq("id", body.account_id);

  if (updateError) return json({ error: updateError.message }, 500);

  const { error: activityError } = await admin
    .schema("growth_os")
    .from("crm_activities")
    .insert({
      account_id: body.account_id,
      activity_type: "call",
      direction: "outbound",
      outcome: body.outcome || null,
      subject: "Llamada outbound",
      body: body.note || null,
      completed_at: completedAt,
      created_by: locals.session?.user.id || null,
    });

  if (activityError) return json({ error: activityError.message }, 500);

  return json({ ok: true });
};
