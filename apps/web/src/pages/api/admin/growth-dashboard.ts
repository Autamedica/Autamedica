import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

type RuntimeEnv = Record<string, unknown> | null | undefined;

function readEnv(runtimeEnv: RuntimeEnv, key: string): string {
  const runtimeValue = runtimeEnv?.[key];
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) return runtimeValue;
  const importValue = import.meta.env[key];
  return typeof importValue === 'string' ? importValue : '';
}

function isAuthorized(locals: any, request: Request, runtimeEnv: RuntimeEnv): boolean {
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

export const GET: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (!isAuthorized(locals, request, runtimeEnv)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || '30'), 1), 365);

  try {
    const admin = createAstroAdminClient(runtimeEnv) as unknown as SupabaseClient<Database>;

    const { data, error } = await (admin as any)
      .schema('growth_os')
      .rpc('dashboard_summary', { days_back: days });

    if (error) throw new Error(error.message);

    // Also fetch recent leads for the table
    const { data: recentLeads, error: leadsError } = await (admin as any)
      .schema('growth_os')
      .from('leads')
      .select('id, email, name, vertical, intent, first_utm_source, first_utm_medium, first_utm_campaign, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (leadsError) {
      logger.error('[growth/dashboard] Failed to fetch recent leads', { error: leadsError });
    }

    // Fetch email job stats
    const { data: emailStats, error: emailError } = await (admin as any)
      .schema('growth_os')
      .from('email_jobs')
      .select('id, job_type, recipient_email, status, sent_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (emailError) {
      logger.error('[growth/dashboard] Failed to fetch email stats', { error: emailError });
    }

    // Fetch nurturing sequence status
    const { data: sequences, error: _seqError } = await (admin as any)
      .schema('growth_os')
      .from('nurturing_sequences')
      .select('id, name, vertical, enabled');

    // Fetch attribution data
    const { data: attribution, error: _attrError } = await (admin as any)
      .schema('growth_os')
      .from('lead_attribution')
      .select('lead_id, lead_email, vertical, first_utm_source, converted_to_appointment, converted_to_revenue, payment_amount, hours_to_appointment')
      .limit(200);

    return json({
      summary: data,
      recent_leads: recentLeads ?? [],
      email_jobs: emailStats ?? [],
      nurturing_sequences: sequences ?? [],
      attribution: attribution ?? [],
    });
  } catch (err) {
    logger.error('[growth/dashboard] Failed to generate dashboard', err);
    return json({ error: 'dashboard_failed' }, 500);
  }
};
