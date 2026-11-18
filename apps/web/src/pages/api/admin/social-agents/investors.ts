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

const INITIAL_INVESTORS = [
  { organization_name: 'Canary', country_code: 'BR', stage_focus: ['Pre-seed', 'Seed', 'Série A'], thesis: 'Healthtech, software, AI; early-stage LATAM', fit_score: 90, priority: 'A', website_url: 'https://canary.com.br/', source_url: 'https://physicianaitools.com/investor-country/brazil/', notes: 'Evidencia: listado entre inversores brasileños de healthcare AI; LAVCA lo incluye entre gestores early-stage activos. Acción: contactar con pitch de expansión regional y métricas de tracción.' },
  { organization_name: 'Kaszek', country_code: 'AR', stage_focus: ['Pre-seed', 'Seed', 'Serie A', 'Serie B'], thesis: 'Healthcare & MedTech, software, fintech', fit_score: 90, priority: 'A', website_url: 'https://kaszek.com/', source_url: 'https://gatsbie.net/investors/healthcare-and-medtech/latam', notes: 'Evidencia: incluido en listado LATAM de fondos con foco Healthcare & MedTech y etapas desde Pre-seed hasta Series B. Acción: preparar narrativa regional, tamaño de mercado y economics.' },
  { organization_name: 'Astella Investimentos', country_code: 'BR', stage_focus: ['Seed', 'Série A'], thesis: 'Digital health, B2B SaaS, software', fit_score: 90, priority: 'A', website_url: 'https://astella.com.br/', source_url: 'https://physicianaitools.com/investor-country/brazil/', notes: 'Evidencia: listado como inversor brasileño en Digital Health y Health IT / Healthcare Software. Acción: presentar modelo SaaS/marketplace y eficiencia de adquisición.' },
  { organization_name: 'DOMO.VC', country_code: 'BR', stage_focus: ['Pre-seed', 'Seed'], thesis: 'Health IT, software, tecnología', fit_score: 90, priority: 'A', website_url: 'https://domo.vc/', source_url: 'https://shizune.co/investors/health-care-vc-funds-latam', notes: 'Evidencia: aparece entre los fondos LATAM con inversiones en healthcare y etapas tempranas. Acción: enfatizar producto, crecimiento y potencial de Brasil.' },
  { organization_name: 'Newtopia VC', country_code: 'AR', stage_focus: ['Pre-seed', 'Seed'], thesis: 'Software, AI, digital health', fit_score: 90, priority: 'A', website_url: 'https://newtopiavc.com/', source_url: 'https://physicianaitools.com/investor-country/argentina/', notes: 'Evidencia: listado como fondo argentino con foco en software y exposición a Digital Health / Health IT. Acción: contactar con tesis de salud digital y expansión regional.' },
  { organization_name: 'Alaya Capital', country_code: 'AR', stage_focus: ['Seed', 'Série A'], thesis: 'Healthtech, SaaS, AI, tecnología', fit_score: 90, priority: 'A', website_url: 'https://alayacapital.com/', source_url: 'https://www.argentina.gob.ar/sites/default/files/cadena_de_valor_-_agtech_2025.pdf', notes: 'Evidencia: documento oficial argentino describe interés en Healthtech y etapas Seed / Serie A. Acción: proponer expansión Argentina-Brasil y alianzas locales.' },
  { organization_name: 'Alexia Ventures', country_code: 'BR', stage_focus: ['Seed', 'Série A'], thesis: 'AI, software, healthcare software', fit_score: 90, priority: 'A', website_url: 'https://alexia.vc/', source_url: 'https://physicianaitools.com/investor-country/brazil/', notes: 'Evidencia: listado entre inversores de healthcare AI; tesis de software y AI con exposición a salud. Acción: destacar automatización, IA clínica-operativa y mercado B2B.' },
  { organization_name: 'Atlantico', country_code: 'BR', stage_focus: ['Early-stage', 'Seed'], thesis: 'Digital health, software, LATAM', fit_score: 86, priority: 'A', website_url: 'https://atlantico.com.br/', source_url: 'https://physicianaitools.com/investor-country/brazil/', notes: 'Evidencia: listado entre fondos brasileños con exposición a Digital Health y software sanitario. Acción: validar etapa y tamaño de ronda antes del acercamiento.' },
  { organization_name: 'Caravela Capital', country_code: 'BR', stage_focus: ['Seed', 'Early-stage'], thesis: 'Digital health, software, innovación regional', fit_score: 86, priority: 'A', website_url: 'https://caravelacapital.com/', source_url: 'https://physicianaitools.com/investor-country/brazil/', notes: 'Evidencia: fondo de Curitiba listado en healthcare AI / Digital Health. Acción: enfocar impacto y expansión fuera de los grandes centros.' },
  { organization_name: 'ABSeed', country_code: 'BR', stage_focus: ['Seed', 'Série A'], thesis: 'B2B SaaS, health IT', fit_score: 82, priority: 'B', website_url: 'https://abseed.com.br/', source_url: 'https://physicianaitools.com/investor-country/brazil/', notes: 'Evidencia: listado con foco en B2B SaaS y Health IT / Healthcare Software. Acción: mostrar ingresos recurrentes, retención y venta B2B.' },
  { organization_name: 'Bossanova Investimentos', country_code: 'BR', stage_focus: ['Pre-seed', 'Seed'], thesis: 'Digital health, software', fit_score: 82, priority: 'B', website_url: 'https://bossanovainvestimentos.com.br/', source_url: 'https://shizune.co/investors/health-care-vc-funds-latam', notes: 'Evidencia: figura entre inversores LATAM activos en healthcare; etapa temprana. Acción: evaluar para ronda inicial o syndicate.' },
  { organization_name: 'CITES', country_code: 'AR', stage_focus: ['Pre-seed', 'Seed'], thesis: 'Deeptech, biotech, medtech, ciencia aplicada', fit_score: 82, priority: 'B', website_url: 'https://cites-gss.com/', source_url: 'https://physicianaitools.com/investor-country/argentina/', notes: 'Evidencia: listado argentino con foco en tecnologías sanitarias; documento oficial lo describe como venture builder de deep tech. Acción: validar componente científico/tecnológico defendible.' },
  { organization_name: 'Globant Ventures', country_code: 'AR', stage_focus: ['Seed', 'Early-stage'], thesis: 'AI, software, digital health', fit_score: 82, priority: 'B', website_url: 'https://www.globant.com/', source_url: 'https://physicianaitools.com/investor-country/argentina/', notes: 'Evidencia: listado como brazo corporativo con exposición a AI/ML in Healthcare y Health IT. Acción: buscar sinergia tecnológica y distribución empresarial.' },
  { organization_name: 'Kamay Ventures', country_code: 'AR', stage_focus: ['Seed', 'Early-stage'], thesis: 'Digital health, innovación, consumer tech', fit_score: 82, priority: 'B', website_url: 'https://kamayventures.com/', source_url: 'https://physicianaitools.com/investor-country/argentina/', notes: 'Evidencia: listado entre inversores argentinos con exposición a Digital Health. Acción: explorar encaje estratégico y canal de distribución.' },
  { organization_name: 'Fleury Ventures', country_code: 'BR', stage_focus: ['Seed', 'Early-stage'], thesis: 'Diagnóstico, AI/ML healthcare, digital health', fit_score: 82, priority: 'B', website_url: 'https://www.grupofleury.com.br/', source_url: 'https://physicianaitools.com/country/brazil/investors/', notes: 'Evidencia: listado como corporate venture del grupo de diagnóstico Fleury con foco sanitario. Acción: proponer integración, pilotos y alianzas de diagnóstico.' },
  { organization_name: 'Eretz.bio — Hospital Israelita Albert Einstein', country_code: 'BR', stage_focus: ['Early-stage'], thesis: 'AI healthcare, biotech, healthtech', fit_score: 82, priority: 'B', website_url: 'https://www.eretz.bio/', source_url: 'https://physicianaitools.com/country/brazil/investors/', notes: 'Evidencia: listado como incubadora/programa de innovación e inversión vinculado al Hospital Albert Einstein. Acción: presentar pilotos clínicos-operativos y evidencia de impacto.' },
  { organization_name: 'Hospital Sírio-Libanês — innovación', country_code: 'BR', stage_focus: ['Alianzas', 'Inversión estratégica'], thesis: 'AI healthcare, digital health', fit_score: 68, priority: 'B', website_url: 'https://www.hospitalsiriolibanes.org.br/', source_url: 'https://physicianaitools.com/country/brazil/investors/', notes: 'Evidencia: la fuente lo identifica con brazo de venture e innovación para healthtech. Acción: priorizar alianza y piloto; confirmar vehículo inversor vigente.' },
  { organization_name: 'Green Rock', country_code: 'BR', stage_focus: ['Pre-seed', 'Seed', 'Série A'], thesis: 'Healthcare, software, care delivery', fit_score: 82, priority: 'B', website_url: 'https://greenrock.vc/', source_url: 'https://shizune.co/investors/health-care-vc-funds-latam', notes: 'Evidencia: aparece en listado de fondos LATAM con actividad en healthcare. Acción: validar tesis actual y ticket antes de outreach.' },
  { organization_name: 'SOSV / IndieBio', country_code: 'GL', stage_focus: ['Pre-seed', 'Seed'], thesis: 'Biotech, healthcare, medical, software', fit_score: 68, priority: 'C', website_url: 'https://sosv.com/', source_url: 'https://shizune.co/investors/health-care-investors-argentina', notes: 'Evidencia: listado con actividad en health care en Argentina y foco biotecnología/salud. Acción: encaje más fuerte si Autamedica presenta deeptech, biotech o IP propia.' },
  { organization_name: 'Prosus Ventures', country_code: 'GL', stage_focus: ['Early-stage', 'Growth'], thesis: 'Healthtech, digital platforms', fit_score: 68, priority: 'C', website_url: 'https://www.prosus.com/', source_url: 'https://www.lavca.org/wp-content/uploads/2025/02/LAVCA_Trends-in-Tech-2025.pdf', notes: 'Evidencia: LAVCA registra participación en la ronda de Mevo, plataforma brasileña de prescripción digital. Acción: candidato estratégico si Autamedica demuestra escala y expansión regional.' },
  { organization_name: 'FJ Labs', country_code: 'GL', stage_focus: ['Seed', 'Series A', 'Series B'], thesis: 'Marketplace, software, plataformas', fit_score: 68, priority: 'C', website_url: 'https://fjlabs.com/', source_url: 'https://shizune.co/investors/health-care-investors-argentina', notes: 'Evidencia: listado con operaciones en startups de healthcare en Argentina. Acción: reforzar modelo marketplace, liquidez y unit economics.' },
  { organization_name: 'Norte Ventures', country_code: 'BR', stage_focus: ['Pre-seed', 'Seed', 'Série A'], thesis: 'Software, tecnología, healthtech', fit_score: 68, priority: 'C', website_url: 'https://norte.ventures/', source_url: 'https://shizune.co/investors/health-care-vc-funds-latam', notes: 'Evidencia: incluido entre fondos con inversiones en healthcare LATAM. Acción: verificar encaje de geografía, etapa y ticket.' },
  { organization_name: 'Monashees', country_code: 'BR', stage_focus: ['Seed', 'Growth'], thesis: 'Software, plataformas, healthcare', fit_score: 68, priority: 'C', website_url: 'https://monashees.com.br/', source_url: 'https://www.lavca.org/wp-content/uploads/2026/02/LAVCA_Trends-in-Tech-2026.pdf', notes: 'Evidencia: LAVCA lo incluye entre gestores activos en early-stage y late-stage de Brasil/LATAM. Acción: acercamiento cuando haya tracción y escala demostrable.' },
  { organization_name: 'Crescera Capital', country_code: 'BR', stage_focus: ['Growth', 'Late-stage'], thesis: 'Healthcare services, care delivery', fit_score: 68, priority: 'C', website_url: 'https://crescera.com/', source_url: 'https://physicianaitools.com/investor-country/brazil/', notes: 'Evidencia: listado en healthcare AI con foco en servicios de salud y crecimiento; ticket indicado de growth/PE. Acción: reservar para etapa de escala, consolidación o ronda mayor.' },
] as const;

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

  if (body.action === 'load_initial_list') {
    const db = createAstroAdminClient(locals.runtime?.env) as any;
    const { data: existing, error: existingError } = await db.from(TABLE)
      .select('organization_name')
      .eq('owner_profile_id', auth.user.id)
      .limit(2000);
    if (existingError) return internalError('investor_seed_lookup_failed');
    const existingNames = new Set((existing ?? []).map((item: { organization_name: string }) => item.organization_name.toLocaleLowerCase('es')));
    const pending = INITIAL_INVESTORS.filter((item) => !existingNames.has(item.organization_name.toLocaleLowerCase('es')));
    if (pending.length === 0) return jsonOk({ inserted: 0, already_present: INITIAL_INVESTORS.length });
    const records = pending.map((item) => ({
      ...item,
      owner_profile_id: auth.user.id,
      status: 'discovered',
      provenance: {
        source: 'autamedica_investor_workbook_2026-11-18',
        fit_label: item.fit_score >= 90 ? 'Alta' : item.fit_score >= 80 ? 'Media-alta' : 'Media',
        captured_at: new Date().toISOString(),
      },
    }));
    const { data: inserted, error: insertError } = await db.from(TABLE)
      .insert(records)
      .select('id');
    if (insertError) return internalError('investor_seed_insert_failed');
    return jsonOk({ inserted: inserted?.length ?? 0, already_present: INITIAL_INVESTORS.length - pending.length });
  }

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
