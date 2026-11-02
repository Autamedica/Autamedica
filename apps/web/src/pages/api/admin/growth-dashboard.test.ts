import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  fail: "",
}));

vi.mock("@autamedica/shared", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    let filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let first = 0;
    let last = 999;
    let count = false;
    const query = {
      select(_columns: string, options?: { count?: string }) { count = Boolean(options?.count); return query; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
      neq(key: string, value: unknown) { filters.push(row => row[key] != null && row[key] !== value); return query; },
      or(expression: string) {
        if (expression !== "first_utm_source.is.null,first_utm_source.neq.codex") throw new Error("Unexpected filter");
        filters.push(row => row.first_utm_source == null || row.first_utm_source !== "codex");
        return query;
      },
      gte(key: string, value: string) { filters.push(row => String(row[key]) >= value); return query; },
      ilike(key: string, value: string) {
        filters.push(row => String(row[key] ?? "").toLowerCase().includes(value.replaceAll("%", "").toLowerCase()));
        return query;
      },
      not(key: string, _operator: string, value: string) {
        filters.push(row => !String(row[key] ?? "").toLowerCase().includes(value.replaceAll("%", "").toLowerCase()));
        return query;
      },
      order() { return query; },
      limit(n: number) { last = n - 1; return query; },
      range(a: number, b: number) { first = a; last = b; return query; },
      then(resolve: (result: unknown) => unknown) {
        const rows = (state.tables[table] ?? []).filter(row => filters.every(test => test(row)));
        return Promise.resolve({
          data: rows.slice(first, last + 1), count: count ? rows.length : null,
          error: state.fail === table ? { message: "query failed" } : null,
        }).then(resolve);
      },
    };
    return query;
  }
  const growth = { from, rpc: async () => ({ data: {
    period_days: 30, total_leads: 0, conversions: { total_revenue: 0 },
  }, error: null }) };
  return { createAstroAdminClient: () => ({ from, schema: () => growth }) };
});

import { GET } from "./growth-dashboard";
import { GET as getCac } from "./growth-cac";

async function request(authorized = true) {
  return GET({
    request: new Request("https://admin.autamedica.com/api/admin/growth-dashboard?days=30"),
    locals: { session: { user: authorized ? { app_metadata: { role: "platform_admin" } } : undefined } },
  } as unknown as Parameters<typeof GET>[0]);
}

beforeEach(() => {
  state.tables = {};
  state.fail = "";
});

describe("Growth dashboard read path", () => {
  it("retains unknown-source leads, excludes test leads and matches profiles against historical leads", async () => {
    const now = new Date().toISOString();
    state.tables.profiles = Array.from({ length: 53 }, (_, n) => ({
      user_id: String(n), email: `person${n}@example.com`, created_at: now,
    }));
    state.tables.leads = [
      { email: "new@example.com", created_at: now, status: "new", first_utm_source: null },
      { email: "other@example.com", created_at: now, status: "new", first_utm_source: null },
      { email: "test@autamedica.test", created_at: now, status: "new", first_utm_source: "codex" },
      { email: " PERSON0@example.com ", created_at: "2020-01-01", status: "unsubscribed" },
    ];
    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary.total_leads).toBe(2);
    expect(body.summary.leads_by_utm_source).toEqual({ unknown: 2 });
    expect(body.supabase_signups.reconciliation).toMatchObject({
      profiles_checked: 53, matched_profiles: 1, unmatched_profiles: 52,
    });
    expect(body.supabase_signups.recent_profiles[0].growth_lead_match).toBe("matched");
  });

  it("reports all Resend events separately from the newsletter subject filter", async () => {
    const now = new Date().toISOString();
    state.tables.email_events = [
      { provider: "resend", event_type: "email.delivered", subject: "Bienvenida", received_at: now },
      { provider: "resend", event_type: "email.clicked", subject: "Bienvenida", received_at: now },
    ];
    const body = await (await request()).json();
    expect(body.resend.delivered_events).toBe(1);
    expect(body.resend.clicked_events).toBe(1);
    expect(body.newsletter.delivered_emails).toBe(0);
  });

  it("rejects unauthorized access", async () => {
    expect((await request(false)).status).toBe(401);
  });

  it("keeps unknown-source attribution in the channel endpoint too", async () => {
    state.tables.lead_attribution = [{
      lead_id: "one", lead_email: "person@example.com", first_utm_source: null,
      lead_status: "new", lead_created_at: new Date().toISOString(),
      converted_to_appointment: false, converted_to_revenue: false,
    }];
    const response = await getCac({
      request: new Request("https://admin.autamedica.com/api/admin/growth-cac?days=30"),
      locals: { session: { user: { app_metadata: { role: "platform_admin" } } } },
    } as unknown as Parameters<typeof getCac>[0]);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.stats).toMatchObject([{ source: "unknown", leads: 1 }]);
  });

  it("fails instead of reporting zero unmatched profiles when reconciliation fails", async () => {
    state.fail = "leads";
    expect((await request()).status).toBe(500);
  });
});
