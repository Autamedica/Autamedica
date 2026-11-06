import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveAdminRole } from '@/lib/admin/auth';
import { canOpenWhatsApp, MANUAL_OUTCOMES, normalizeArPhone } from '@/lib/b2c/whatsapp-crm';

export const prerender = false;
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = ['pending','contacted','replied','interested','not_interested','no_response','do_not_contact'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

async function adminDb(locals: App.Locals): Promise<SupabaseClient | null> {
  const role = await resolveAdminRole(locals.session, locals.supabase);
  if (!role) return null;
  return createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
}

type Row = {
  id: string; source_key: string; country_code: string; display_name: string;
  phone_e164: string | null; phone_status: string; consent_status: string;
  consent_evidence: string | null; consent_verified_at: string | null;
  contact_status: string; exclusion_reason: string | null; patient_id: string | null;
  last_outbound_at: string | null; last_inbound_at: string | null; created_at: string;
};
type ImportRow = {
  source_key?: unknown; display_name?: unknown; phone?: unknown;
  crossed_out?: unknown; excluded?: unknown; exclusion_reason?: unknown;
};

export const GET: APIRoute = async ({ locals, request }) => {
  const db = await adminDb(locals);
  if (!db) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page') || '1') || 1));
  const perPage = 75;
  const status = url.searchParams.get('status') || 'all';
  if (status !== 'all' && !statuses.includes(status)) return json({ error: 'invalid_status' }, 400);
  const queryText = (url.searchParams.get('q') || '').trim().slice(0, 100);

  let q = db.from('b2c_whatsapp_contacts')
    .select('id,source_key,country_code,display_name,phone_e164,phone_status,consent_status,consent_evidence,consent_verified_at,contact_status,exclusion_reason,patient_id,last_outbound_at,last_inbound_at,created_at', { count: 'exact' })
    .eq('country_code', 'AR')
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);
  if (status !== 'all') q = q.eq('contact_status', status);
  if (queryText) q = q.ilike('display_name', '%' + queryText + '%');
  const [{ data, error, count }, totalResult, verifiedResult, blockedResult] = await Promise.all([
    q,
    db.from('b2c_whatsapp_contacts').select('id', { count: 'exact', head: true }).eq('country_code','AR'),
    db.from('b2c_whatsapp_contacts').select('id', { count: 'exact', head: true }).eq('country_code','AR').eq('consent_status','verified'),
    db.from('b2c_whatsapp_contacts').select('id', { count: 'exact', head: true }).eq('country_code','AR').eq('contact_status','do_not_contact'),
  ]);
  if (error || totalResult.error || verifiedResult.error || blockedResult.error) {
    return json({ error: 'crm_read_failed' }, 500);
  }
  const rows = (data || []) as Row[];
  const ids = [...new Set(rows.map(r => r.patient_id).filter((id): id is string => Boolean(id)))];
  const paymentCounts = new Map<string, { verifiedPayments: number; amountARSMinor: number }>();
  const appointmentCounts = new Map<string, number>();
  if (ids.length) {
    const [payments, appointments] = await Promise.all([
      db.from('appointment_payments').select('patient_id,appointment_id,gross_amount,currency')
        .in('patient_id', ids).eq('status','approved').not('paid_at','is',null),
      db.from('appointments').select('id,patient_id,status').in('patient_id',ids),
    ]);
    if (payments.error || appointments.error) return json({ error: 'conversion_read_failed' }, 500);
    for (const payment of payments.data || []) {
      if (!payment.patient_id) continue;
      const previous = paymentCounts.get(payment.patient_id) || { verifiedPayments: 0, amountARSMinor: 0 };
      previous.verifiedPayments++;
      if (payment.currency === 'ARS') previous.amountARSMinor += Number(payment.gross_amount || 0);
      paymentCounts.set(payment.patient_id, previous);
    }
    for (const appointment of appointments.data || []) {
      if (appointment.status !== 'completed' || !appointment.patient_id) continue;
      appointmentCounts.set(appointment.patient_id, (appointmentCounts.get(appointment.patient_id) || 0) + 1);
    }
  }
  return json({
    total: totalResult.count || 0, consent_verified: verifiedResult.count || 0,
    blocked: blockedResult.count || 0, count: count || 0, page, per_page: perPage,
    records: rows.map(r => {
      const completed = r.patient_id ? appointmentCounts.get(r.patient_id) || 0 : 0;
      const payments = r.patient_id ? paymentCounts.get(r.patient_id) : undefined;
      return { ...r, can_contact: canOpenWhatsApp(r),
        completed_consultations: completed, reconsultations: Math.max(0, completed - 1),
        approved_payments: payments?.verifiedPayments || 0, approved_amount_ars_minor: payments?.amountARSMinor || 0 };
    }),
    metrics_note: 'Payments and consultations are verified patient history, not automatically attributed to WhatsApp.',
  });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const db = await adminDb(locals);
  if (!db) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') return json({ error: 'invalid_body' }, 400);
  const now = new Date().toISOString();
  if (body.action === 'import') {
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 100) {
      return json({ error: 'max_100_rows_per_request' }, 400);
    }
    const values = (body.rows as ImportRow[]).map(row => {
      const name = typeof row.display_name === 'string' ? row.display_name.trim().slice(0,180) : '';
      const sourceKey = typeof row.source_key === 'string' ? row.source_key.trim().slice(0,160) : '';
      const phone = normalizeArPhone(row.phone);
      const crossed = row.crossed_out === true;
      const excluded = row.excluded === true || crossed;
      const reason = excluded
        ? (typeof row.exclusion_reason === 'string' && row.exclusion_reason.trim()
          ? row.exclusion_reason.trim().slice(0,250) : crossed ? 'Teléfono tachado' : 'Exclusión en fuente')
        : null;
      if (name.length < 1 || sourceKey.length < 3) return null;
      return {
        source_key: sourceKey, country_code: 'AR', display_name: name,
        phone_e164: crossed ? null : phone,
        phone_status: crossed ? 'crossed_out' : !row.phone ? 'missing' : phone ? 'valid_format' : 'needs_review',
        consent_status: 'pending', contact_status: excluded ? 'do_not_contact' : 'pending',
        exclusion_reason: reason,
      };
    });
    if (values.some(v => !v)) return json({ error: 'invalid_import_row' }, 400);
    const { data, error } = await db.from('b2c_whatsapp_contacts')
      .upsert(values, { onConflict: 'source_key', ignoreDuplicates: true }).select('id');
    if (error) return json({ error: 'import_failed', detail: error.code }, 422);
    return json({ imported: data?.length || 0, attempted: values.length, consent_state: 'pending' });
  }
  if (!UUID.test(String(body.id || ''))) return json({ error: 'invalid_contact_id' }, 400);
  const { data: contact, error: readError } = await db.from('b2c_whatsapp_contacts')
    .select('id,contact_status,consent_status,phone_status,phone_e164')
    .eq('id', body.id).eq('country_code','AR').maybeSingle();
  if (readError) return json({ error: 'crm_read_failed' }, 500);
  if (!contact) return json({ error: 'contact_not_found' }, 404);
  const id = contact.id as string;
  const updates: Record<string, unknown> = { updated_at: now };
  let eventType = '';
  if (body.action === 'verify_consent') {
    const evidence = typeof body.evidence === 'string' ? body.evidence.trim() : '';
    if (contact.contact_status === 'do_not_contact' || contact.consent_status === 'withdrawn')
      return json({ error: 'cannot_restore_excluded_contact' }, 409);
    if (evidence.length < 12 || evidence.length > 250)
      return json({ error: 'consent_evidence_required' }, 400);
    updates.consent_status = 'verified';
    updates.consent_evidence = evidence;
    updates.consent_verified_at = now;
    eventType = 'consent_verified';
  } else if (body.action === 'outcome') {
    const outcome = typeof body.outcome === 'string' ? body.outcome : '';
    if (!(outcome in MANUAL_OUTCOMES)) return json({ error: 'invalid_outcome' }, 400);
    const transition = MANUAL_OUTCOMES[outcome as keyof typeof MANUAL_OUTCOMES];
    if (contact.contact_status === 'do_not_contact' && outcome !== 'opt_out')
      return json({ error: 'excluded_contact' }, 409);
    if (outcome === 'sent' && !canOpenWhatsApp(contact))
      return json({ error: 'not_eligible_for_outreach' }, 409);
    updates.contact_status = transition.status;
    if (outcome === 'sent') updates.last_outbound_at = now;
    if (outcome === 'replied') updates.last_inbound_at = now;
    if (outcome === 'opt_out') {
      updates.consent_status = 'withdrawn';
      updates.exclusion_reason = 'Baja registrada manualmente';
    }
    eventType = transition.event;
  } else if (body.action === 'link_patient') {
    if (!UUID.test(String(body.patient_id || ''))) return json({ error: 'invalid_patient_id' }, 400);
    const { data: patient, error: patientError } = await db.from('patients')
      .select('id').eq('id', body.patient_id).maybeSingle();
    if (patientError) return json({ error: 'patient_lookup_failed' }, 500);
    if (!patient) return json({ error: 'patient_not_found' }, 404);
    updates.patient_id = patient.id;
    eventType = 'patient_linked';
  } else {
    return json({ error: 'invalid_action' }, 400);
  }
  const { data: saved, error } = await db.from('b2c_whatsapp_contacts').update(updates)
    .eq('id', id).eq('contact_status', contact.contact_status).select('id').maybeSingle();
  if (error) return json({ error: 'crm_update_failed' }, 500);
  if (!saved) return json({ error: 'concurrent_update_retry' }, 409);
  const { error: eventError } = await db.from('b2c_whatsapp_events')
    .insert({ contact_id: id, event_type: eventType, origin: 'admin', recorded_by: locals.session?.user?.id || null });
  if (eventError) return json({ ok: true, warning: 'audit_event_failed' }, 207);
  return json({ ok: true });
};
