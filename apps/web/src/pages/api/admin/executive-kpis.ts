import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveAdminRole } from '@/lib/admin/auth';

export const prerender = false;

type Country = 'AR' | 'BR' | 'UNKNOWN';
type RowError = { message: string } | null;
type PageResult = { data: unknown[] | null; error: RowError };
type PageQuery = (from: number, to: number) => PromiseLike<PageResult>;

type Appointment = { id: string; patient_id: string | null; status: string; created_at: string; deleted_at: string | null };
type Patient = { id: string; care_country: string | null };
type Dispatch = {
  id: string; patient_id: string | null; care_country: string | null; status: string;
  created_at: string; call_started_at: string | null; referral_partner_id: string | null;
};
type Pay = {
  id: string; appointment_id?: string | null; patient_id?: string | null;
  dispatch_request_id?: string | null; status: string; currency: string;
  gross_amount?: number | null; amount_minor?: number | null;
  created_at: string; paid_at: string | null;
};
type Prescription = { id: string; appointment_id: string | null; country_code: string | null; status: string; created_at: string };
type Certificate = { id: string; appointment_id: string | null; country_code: string | null; status: string; created_at: string };
type Commission = { id: string; referral_partner_id: string; dispatch_request_id: string; status: string; amount_minor: number; currency: string; created_at: string };
type Partner = { id: string; code: string; display_name: string; active: boolean };

const PAGE_SIZE = 1000;
const APPROVED = new Set(['approved']);
const ISSUED = new Set(['signed', 'sent', 'dispensed_total', 'dispensed_partial']);

async function readAll<T>(query: PageQuery): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < 100_000; start += PAGE_SIZE) {
    const { data, error } = await query(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Missing query data');
    rows.push(...data as T[]);
    if (data.length < PAGE_SIZE) return rows;
  }
  throw new Error('Executive metrics exceeded safe pagination bound');
}

function countryOf(value: string | null | undefined): Country {
  return value === 'AR' || value === 'BR' ? value : 'UNKNOWN';
}

function ms(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.ceil(fraction * sorted.length) - 1] * 10) / 10;
}

function totalsByCurrency(rows: Pay[]): Record<string, { count: number; amount: number }> {
  const result: Record<string, { count: number; amount: number }> = {};
  for (const row of rows) {
    const code = row.currency?.toUpperCase() || 'UNKNOWN';
    const raw = row.amount_minor ?? row.gross_amount;
    if (!Number.isFinite(Number(raw)) || raw == null) continue;
    if (!result[code]) result[code] = { count: 0, amount: 0 };
    result[code].count += 1;
    result[code].amount += Number(raw) / 100;
  }
  for (const entry of Object.values(result)) entry.amount = Math.round(entry.amount * 100) / 100;
  return result;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers });

  // This endpoint uses service privileges after verifying the interactive admin session.
  // Never authorize it using query parameters, user_metadata, or a public API key.
  const adminRole = await resolveAdminRole(locals.session, locals.supabase);
  // Organization admins are tenant-scoped and must not see platform-wide revenue.
  if (adminRole !== 'platform_admin' && adminRole !== 'admin') return fail(403, 'forbidden');

  const url = new URL(request.url);
  const countryParam = url.searchParams.get('country') ?? 'BR';
  const daysParam = Number(url.searchParams.get('days') ?? 30);
  if (!['AR', 'BR', 'UNKNOWN'].includes(countryParam) || ![7, 30, 90].includes(daysParam)) {
    return fail(400, 'invalid_filters');
  }
  const country = countryParam as Country;
  const since = new Date(Date.now() - daysParam * 86_400_000).toISOString();
  const currentTimestamp = new Date().toISOString();

  try {
    const db = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;

    const [patients, appointments, dispatches, appointmentPayments, dispatchPayments, prescriptions, certificates, commissions, partners] =
      await Promise.all([
        readAll<Patient>((a, b) => db.from('patients').select('id,care_country').order('id').range(a, b)),
        readAll<Appointment>((a, b) => db.from('appointments').select('id,patient_id,status,created_at,deleted_at').order('created_at').order('id').range(a, b)),
        readAll<Dispatch>((a, b) => db.from('pharmacy_dispatch_requests').select('id,patient_id,care_country,status,created_at,call_started_at,referral_partner_id').order('created_at').order('id').range(a, b)),
        readAll<Pay>((a, b) => db.from('appointment_payments').select('id,appointment_id,patient_id,status,currency,gross_amount,created_at,paid_at').order('created_at').order('id').range(a, b)),
        readAll<Pay>((a, b) => db.from('pharmacy_dispatch_payments').select('id,dispatch_request_id,status,currency,amount_minor,created_at,paid_at').order('created_at').order('id').range(a, b)),
        readAll<Prescription>((a, b) => db.from('prescriptions').select('id,appointment_id,country_code,status,created_at').gte('created_at', since).order('created_at').order('id').range(a, b)),
        readAll<Certificate>((a, b) => db.from('medical_certificates').select('id,appointment_id,country_code,status,created_at').gte('created_at', since).order('created_at').order('id').range(a, b)),
        readAll<Commission>((a, b) => db.from('commercial_referral_commissions').select('id,referral_partner_id,dispatch_request_id,status,amount_minor,currency,created_at').gte('created_at', since).order('created_at').order('id').range(a, b)),
        readAll<Partner>((a, b) => db.from('commercial_referral_partners').select('id,code,display_name,active').order('id').range(a, b)),
      ]);

    const patientCountry = new Map(patients.map(p => [p.id, countryOf(p.care_country)]));
    const appointmentMap = new Map(appointments.filter(a => !a.deleted_at).map(a => [a.id, a]));
    const dispatchMap = new Map(dispatches.map(d => [d.id, d]));

    const appointmentCountry = (row: Appointment): Country => patientCountry.get(row.patient_id ?? '') ?? 'UNKNOWN';
    const appointmentPaymentCountry = (row: Pay): Country => {
      const appt = row.appointment_id ? appointmentMap.get(row.appointment_id) : undefined;
      const patientId = row.patient_id ?? appt?.patient_id;
      return patientCountry.get(patientId ?? '') ?? 'UNKNOWN';
    };
    const dispatchPaymentCountry = (row: Pay): Country =>
      countryOf(dispatchMap.get(row.dispatch_request_id ?? '')?.care_country);

    const visibleAppointments = [...appointmentMap.values()].filter(a => a.created_at >= since && appointmentCountry(a) === country);
    const visibleDispatches = dispatches.filter(d => d.created_at >= since && countryOf(d.care_country) === country);
    const visiblePrescriptions = prescriptions.filter(r => countryOf(r.country_code) === country);
    const visibleCertificates = certificates.filter(r => countryOf(r.country_code) === country);
    const visibleAppointmentPays = appointmentPayments.filter(p => (p.created_at >= since || (p.paid_at !== null && p.paid_at >= since)) && appointmentPaymentCountry(p) === country);
    const visibleDispatchPays = dispatchPayments.filter(p => (p.created_at >= since || (p.paid_at !== null && p.paid_at >= since)) && dispatchPaymentCountry(p) === country);

    const waitMinutes = visibleDispatches.flatMap(d => {
      const start = ms(d.created_at);
      const connected = ms(d.call_started_at);
      if (start === null || connected === null || connected < start) return [];
      return [(connected - start) / 60_000];
    }).sort((a, b) => a - b);

    const startedUnderFive = waitMinutes.filter(value => value <= 5).length;
    const approvedPays = [...visibleAppointmentPays, ...visibleDispatchPays].filter(
      p => APPROVED.has(p.status) && p.paid_at && ms(p.paid_at)! >= ms(since)!
    );
    const paymentsWithIncompleteDate = [...visibleAppointmentPays, ...visibleDispatchPays]
      .filter(p => APPROVED.has(p.status) && !p.paid_at).length;

    const completedAppointmentIds = new Set(visibleAppointments.filter(a => a.status === 'completed').map(a => a.id));
    const issuedAppointmentIds = new Set(visiblePrescriptions
      .filter(r => ISSUED.has(r.status) && r.appointment_id && completedAppointmentIds.has(r.appointment_id))
      .map(r => r.appointment_id as string));
    const completedDispatch = visibleDispatches.filter(d => d.status === 'completed');
    const partnerRows = partners.filter(p => visibleDispatches.some(d => d.referral_partner_id === p.id)).map(p => {
      const referred = visibleDispatches.filter(d => d.referral_partner_id === p.id);
      const referredIds = new Set(referred.map(r => r.id));
      const associatedPayments = visibleDispatchPays.filter(payment => payment.dispatch_request_id && referredIds.has(payment.dispatch_request_id));
      const payable = commissions.filter(c => c.referral_partner_id === p.id && referredIds.has(c.dispatch_request_id) && c.status === 'eligible');
      return {
        code: p.code, name: p.display_name, active: p.active,
        requests: referred.length, operationally_completed: referred.filter(d => d.status === 'completed').length,
        approved_payments: associatedPayments.filter(payment => payment.status === 'approved' && payment.paid_at).length,
        eligible_commissions: payable.length,
        eligible_commission_by_currency: Object.fromEntries(
          [...new Set(payable.map(c => c.currency))].map(code => [code, payable.filter(c => c.currency === code)
            .reduce((sum, c) => sum + c.amount_minor / 100, 0)])
        ),
      };
    });

    const unknownCountryDispatches = dispatches.filter(d => d.created_at >= since && countryOf(d.care_country) === 'UNKNOWN').length;
    const unknownCountryAppointments = [...appointmentMap.values()].filter(a => a.created_at >= since && appointmentCountry(a) === 'UNKNOWN').length;
    const unknownCountryAppointmentPayments = appointmentPayments.filter(p => (p.created_at >= since || (p.paid_at !== null && p.paid_at >= since)) && appointmentPaymentCountry(p) === 'UNKNOWN').length;
    const allPaid = [...visibleAppointmentPays, ...visibleDispatchPays];

    return new Response(JSON.stringify({
      generated_at: currentTimestamp,
      days: daysParam,
      country,
      operational: {
        requests: visibleDispatches.length,
        completed_requests: completedDispatch.length,
        expired_requests: visibleDispatches.filter(d => d.status === 'expired').length,
        cancelled_requests: visibleDispatches.filter(d => d.status === 'cancelled').length,
        started_calls_with_timestamp: waitMinutes.length,
        started_within_five_minutes: startedUnderFive,
        wait_p50_minutes: percentile(waitMinutes, 0.5),
        wait_p90_minutes: percentile(waitMinutes, 0.9),
      },
      appointments: {
        total: visibleAppointments.length,
        completed: completedAppointmentIds.size,
        no_show: visibleAppointments.filter(a => a.status === 'no_show').length,
        cancelled: visibleAppointments.filter(a => a.status === 'cancelled').length,
      },
      documents: {
        prescriptions_total: visiblePrescriptions.length,
        prescriptions_draft: visiblePrescriptions.filter(r => r.status === 'draft').length,
        prescriptions_issued: visiblePrescriptions.filter(r => ISSUED.has(r.status)).length,
        certificates_signed: visibleCertificates.filter(r => r.status === 'signed').length,
        completed_appointments_with_issued_prescription: issuedAppointmentIds.size,
      },
      payments: {
        approved: approvedPays.length,
        pending: allPaid.filter(p => p.status === 'pending').length,
        refunded: allPaid.filter(p => p.status === 'refunded').length,
        approved_without_paid_at: paymentsWithIncompleteDate,
        approved_amount_by_currency: totalsByCurrency(approvedPays),
        // No revenue may be calculated from draft/checkouts or from missing timestamps.
        amount_method: 'Approved payment rows with paid_at; amounts are minor units divided by 100; not net earnings.',
      },
      referrals: partnerRows,
      quality: {
        unattributed_country_requests: unknownCountryDispatches,
        unattributed_country_appointments: unknownCountryAppointments,
        unattributed_country_appointment_payments: unknownCountryAppointmentPayments,
        country_inferred_from_currency: false,
        qr_scan_events_available: false,
        clinical_completion_verified: false,
        acquisition_cost_fully_reconciled: false,
        variable_costs_fully_reconciled: false,
        patient_recurrence_ready: false,
      },
      unavailable: [
        { metric: 'CAC real por paciente que pagó', reason: 'Falta conciliación de costos totales por canal e identificación de primeros pagos.' },
        { metric: 'Embudo QR → pago', reason: 'El QR se atribuye en el despacho, pero no hay un registro validado de impresiones y escaneos.' },
        { metric: 'Margen de contribución neto', reason: 'Faltan costos reales de pasarela, honorarios liquidados y otros costos variables por transacción.' },
        { metric: 'Retención a 90 días / LTV', reason: 'Se necesita enlazar consistentemente paciente, atención, pago y cohorte, separando AR y BR.' },
      ],
    }), { status: 200, headers });
  } catch {
    // Avoid leaking patient data, SQL details or credentials to the client.
    return fail(500, 'executive_metrics_unavailable');
  }
};
