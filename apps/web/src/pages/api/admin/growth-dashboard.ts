import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

type RuntimeEnv = Record<string, unknown> | null | undefined;
type QueryError = { message: string };
type QueryResponse<T> = { data: T | null; error: QueryError | null };
type QueryChain<T> = PromiseLike<QueryResponse<T>> & {
  order(column: string, options?: { ascending?: boolean }): QueryChain<T>;
  limit(count: number): QueryChain<T>;
};
type GrowthSchemaClient = {
  rpc<T>(fn: string, args: Record<string, unknown>): PromiseLike<QueryResponse<T>>;
  from<Row>(table: string): {
    select(columns: string): QueryChain<Row[]>;
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
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) return runtimeValue;
  const importValue = import.meta.env[key];
  return typeof importValue === 'string' ? importValue : '';
}

function isAuthorized(locals: App.Locals, request: Request, runtimeEnv: RuntimeEnv): boolean {
  // Check session first (for admin UI)
  const session = locals.session;
  if (session) {
    const role = (session.user.user_metadata as Record<string, unknown>)?.role;
    if (typeof role === 'string' && ['admin', 'organization_admin', 'platform_admin'].includes(role)) {
      return true;
    }
  }

  // Check secret (for cron/internal)
  const secret = readEnv(runtimeEnv, 'CRON_SECRET') || readEnv(runtimeEnv, 'TRIGGER_KEY');
  if (!secret) return false;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const triggerKey = request.headers.get('x-trigger-key');
  return bearer === secret || triggerKey === secret;
}

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function centsToMajorUnit(value: number | string | null | undefined): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

function normalizeSummary(summary: DashboardSummary | null): DashboardSummary | null {
  if (!summary) return summary;

  return {
    ...summary,
    conversions: {
      ...summary.conversions,
      total_revenue: centsToMajorUnit(summary.conversions.total_revenue),
    },
  };
}

function normalizeAttribution(rows: LeadAttributionRow[] | null): LeadAttributionRow[] {
  return (rows ?? []).map((row) => ({
    ...row,
    payment_amount: row.payment_amount === null ? null : centsToMajorUnit(row.payment_amount),
  }));
}

export const GET: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (!isAuthorized(locals, request, runtimeEnv)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || '30'), 1), 365);

  try {
    const admin = createAstroAdminClient(runtimeEnv) as unknown as SupabaseClient<Database>;
    const growth = admin.schema('growth_os') as unknown as GrowthSchemaClient;

    const { data, error } = await growth.rpc<DashboardSummary>('dashboard_summary', { days_back: days });

    if (error) throw new Error(error.message);

    // Also fetch recent leads for the table
    const { data: recentLeads, error: leadsError } = await growth
      .from<RecentLeadRow>('leads')
      .select('id, email, name, vertical, intent, first_utm_source, first_utm_medium, first_utm_campaign, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (leadsError) {
      logger.error('[growth/dashboard] Failed to fetch recent leads', { error: leadsError });
    }

    // Fetch email job stats
    const { data: emailStats, error: emailError } = await growth
      .from<EmailJobRow>('email_jobs')
      .select('id, job_type, recipient_email, status, sent_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (emailError) {
      logger.error('[growth/dashboard] Failed to fetch email stats', { error: emailError });
    }

    // Fetch nurturing sequence status
    const { data: sequences, error: seqError } = await growth
      .from<NurturingSequenceRow>('nurturing_sequences')
      .select('id, name, vertical, enabled');

    if (seqError) {
      logger.error('[growth/dashboard] Failed to fetch nurturing sequences', { error: seqError });
    }

    // Fetch attribution data
    const { data: attribution, error: attrError } = await growth
      .from<LeadAttributionRow>('lead_attribution')
      .select('lead_id, lead_email, vertical, first_utm_source, converted_to_appointment, converted_to_revenue, payment_amount, hours_to_appointment')
      .limit(200);

    if (attrError) {
      logger.error('[growth/dashboard] Failed to fetch attribution data', { error: attrError });
    }

    return json({
      summary: normalizeSummary(data),
      recent_leads: recentLeads ?? [],
      email_jobs: emailStats ?? [],
      nurturing_sequences: sequences ?? [],
      attribution: normalizeAttribution(attribution),
    });
  } catch (err) {
    logger.error('[growth/dashboard] Failed to generate dashboard', err);
    return json({ error: 'dashboard_failed' }, 500);
  }
};
