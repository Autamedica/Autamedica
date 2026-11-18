import type { APIRoute } from 'astro';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, conflict, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { buildInvestorXlsx, type InvestorExportRow } from '@/lib/social-agents/investor-xlsx';

export const prerender = false;

const TABLE = 'social_agent_investors';
const STATUSES = ['discovered', 'qualified', 'researching', 'ready_to_connect', 'invitation_sent', 'connected', 'replied', 'meeting', 'passed'] as const;
const PRIORITIES = ['A', 'B', 'C'] as const;
const SELECT_COLUMNS = 'id,organization_name,contact_name,role_title,country_code,thesis,stage_focus,ticket_range,linkedin_url,website_url,source_url,fit_score,priority,status,last_contacted_at,next_follow_up_at,outreach_message,notes,provenance,created_at,updated_at';

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function isValidWebUrl(value: string | null): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const db = createAstroAdminClient(locals.runtime?.env) as any;
  const params = new URL(request.url).searchParams;
  const status = params.get('status');
  const priority = params.get('priority');
  const search = (params.get('q') ?? '').trim().toLocaleLowerCase('es');

  let query = db.from(TABLE).select(SELECT_COLUMNS)
    .eq('owner_profile_id', auth.user.id)
    .order('fit_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);

  if (status && STATUSES.includes(status as typeof STATUSES[number])) query = query.eq('status', status);
  if (priority && PRIORITIES.includes(priority as typeof PRIORITIES[number])) query = query.eq('priority', priority);

  const { data, error } = await query;
  if (error) return internalError('investor_crm_unavailable');

  const rows = (data ?? []) as InvestorExportRow[];
  const filteredRows = search ? rows.filter((row: any) => [row.organization_name, row.contact_name, row.role_title, row.country_code, row.thesis].some((value) => typeof value === 'string' && value.toLocaleLowerCase('es').includes(search))) : rows;
  if (params.get('export') === 'xlsx') {
    const workbook = buildInvestorXlsx(filteredRows);
    const filename = `autamedica-inversores-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(workbook.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie, Authorization',
      },
    });
  }

  return jsonOk(filteredRows);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return badRequest('investor_payload_required');

  const organizationName = cleanText(body.organization_name, 180);
  if (!organizationName) return badRequest('organization_name_required');

  const linkedinUrl = cleanText(body.linkedin_url, 500);
  const websiteUrl = cleanText(body.website_url, 500);
  const sourceUrl = cleanText(body.source_url, 500);
  if (![linkedinUrl, websiteUrl, sourceUrl].every(isValidWebUrl)) return badRequest('https_urls_required');

  const fitScore = Number.isFinite(Number(body.fit_score))
    ? Math.max(0, Math.min(100, Math.round(Number(body.fit_score))))
    : 0;
  const priority = PRIORITIES.includes(body.priority as typeof PRIORITIES[number])
    ? body.priority as string
    : fitScore >= 80 ? 'A' : fitScore >= 60 ? 'B' : 'C';
  const stageFocus = Array.isArray(body.stage_focus)
    ? body.stage_focus.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean).slice(0, 12)
    : [];

  const payload = {
    owner_profile_id: auth.user.id,
    organization_name: organizationName,
    contact_name: cleanText(body.contact_name, 140),
    role_title: cleanText(body.role_title, 140),
    country_code: cleanText(body.country_code, 2)?.toUpperCase() ?? null,
    thesis: cleanText(body.thesis, 1500),
    stage_focus: stageFocus,
    ticket_range: cleanText(body.ticket_range, 120),
    linkedin_url: linkedinUrl,
    website_url: websiteUrl,
    source_url: sourceUrl,
    fit_score: fitScore,
    priority,
    status: 'discovered',
    notes: cleanText(body.notes, 3000),
    provenance: {
      source: cleanText(body.source, 120) ?? 'manual',
      captured_at: new Date().toISOString(),
    },
  };

  const db = createAstroAdminClient(locals.runtime?.env) as any;
  const { data, error } = await db.from(TABLE).insert(payload).select(SELECT_COLUMNS).single();
  if (error?.code === '23505') return conflict('investor_already_exists');
  if (error || !data) return internalError('investor_create_failed');
  return jsonOk(data, 201);
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return badRequest('valid_investor_id_required');

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.status === 'string') {
    if (!STATUSES.includes(body.status as typeof STATUSES[number])) return badRequest('invalid_investor_status');
    patch.status = body.status;
    if (body.status === 'invitation_sent') patch.last_contacted_at = new Date().toISOString();
  }
  if (typeof body?.priority === 'string') {
    if (!PRIORITIES.includes(body.priority as typeof PRIORITIES[number])) return badRequest('invalid_investor_priority');
    patch.priority = body.priority;
  }
  if (body?.outreach_message !== undefined) {
    if (typeof body.outreach_message !== 'string' || body.outreach_message.length > 2000) return badRequest('invalid_outreach_message');
    patch.outreach_message = body.outreach_message.trim();
  }
  if (body?.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 3000) return badRequest('invalid_investor_notes');
    patch.notes = body.notes.trim();
  }
  if (body?.next_follow_up_at !== undefined) {
    if (body.next_follow_up_at === null || body.next_follow_up_at === '') patch.next_follow_up_at = null;
    else {
      const date = new Date(String(body.next_follow_up_at));
      if (Number.isNaN(date.getTime())) return badRequest('invalid_follow_up_date');
      patch.next_follow_up_at = date.toISOString();
    }
  }
  if (Object.keys(patch).length === 1) return badRequest('no_investor_changes');

  const db = createAstroAdminClient(locals.runtime?.env) as any;
  const { data, error } = await db.from(TABLE).update(patch)
    .eq('id', id)
    .eq('owner_profile_id', auth.user.id)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) return internalError('investor_update_failed');
  if (!data) return badRequest('investor_not_found');
  return jsonOk(data);
};
