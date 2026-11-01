import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveAdminRole } from '@/lib/admin/auth';

// Admin only. Never return patient, doctor or payment IDs, clinical notes or URLs.
export const prerender = false;

type CountResult = { count: number | null; error: { message: string } | null };
type GrowthRead = {
  from: (table: string) => {
    select: (columns: string, options: { count: 'exact'; head: true }) => PromiseLike<CountResult>;
  };
};

function assertCount(result: CountResult, label: string): number {
  if (result.error || result.count === null) {
    throw new Error(`Unable to count ${label}: ${result.error?.message ?? 'missing count'}`);
  }
  return result.count;
}

type Currency = 'ARS' | 'BRL';
type PaymentSummary = {
  currency: Currency;
  approved_records: number;
  pending_records: number;
  refunded_records: number;
  approved_with_provider_id: number;
  approved_without_provider_id: number;
  approved_minor_units: number | null;
  settled_revenue_minor_units: null;
  status: 'UNRECONCILED';
};

export const GET: APIRoute = async ({ locals }) => {
  const role = await resolveAdminRole(locals.session, locals.supabase);
  if (!role) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const last30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const growth = (admin as unknown as { schema: (name: string) => GrowthRead }).schema('growth_os');
    const [
      patients, patients30, appointments, appointments30,
      completed, noShow, cancelled, paymentPending,
      opportunities, accounts, leads, paymentsQuery,
    ] = await Promise.all([
      admin.from('patients').select('id', { count: 'exact', head: true }),
      admin.from('patients').select('id', { count: 'exact', head: true }).gte('created_at', last30),
      admin.from('appointments').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      admin.from('appointments').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', last30),
      admin.from('appointments').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'completed'),
      admin.from('appointments').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'no_show'),
      admin.from('appointments').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'cancelled'),
      admin.from('appointments').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'payment_pending'),
      growth.from('crm_opportunities').select('id', { count: 'exact', head: true }),
      growth.from('crm_accounts').select('id', { count: 'exact', head: true }),
      growth.from('leads').select('id', { count: 'exact', head: true }),
      admin.from('appointment_payments')
        .select('currency,status,gross_amount,provider_payment_id', { count: 'exact' })
        .limit(1000),
    ]);

    if (paymentsQuery.error || paymentsQuery.count === null) {
      throw new Error('Unable to read payment summary');
    }

    const paymentsComplete = paymentsQuery.count <= 1000;
    const paymentRows = paymentsComplete ? paymentsQuery.data ?? [] : [];
    const byCurrency: Record<Currency, PaymentSummary> = {
      ARS: { currency: 'ARS', approved_records: 0, pending_records: 0, refunded_records: 0,
        approved_with_provider_id: 0, approved_without_provider_id: 0, approved_minor_units: paymentsComplete ? 0 : null,
        settled_revenue_minor_units: null, status: 'UNRECONCILED' },
      BRL: { currency: 'BRL', approved_records: 0, pending_records: 0, refunded_records: 0,
        approved_with_provider_id: 0, approved_without_provider_id: 0, approved_minor_units: paymentsComplete ? 0 : null,
        settled_revenue_minor_units: null, status: 'UNRECONCILED' },
    };
    for (const row of paymentRows) {
      if (row.currency !== 'ARS' && row.currency !== 'BRL') {
        throw new Error('Unknown payment currency; cannot report totals safely');
      }
      const dest = byCurrency[row.currency];
      if (row.status === 'approved') {
        dest.approved_records++;
        if (row.provider_payment_id) dest.approved_with_provider_id++;
        else dest.approved_without_provider_id++;
        dest.approved_minor_units = (dest.approved_minor_units ?? 0) + row.gross_amount;
      } else if (row.status === 'pending') dest.pending_records++;
      else if (row.status === 'refunded') dest.refunded_records++;
    }

    return new Response(JSON.stringify({
      snapshot_at: new Date().toISOString(),
      data_source: 'Supabase production (historical operational statuses)',
      patient_records: assertCount(patients, 'patients'),
      patient_records_30d: assertCount(patients30, 'patients 30d'),
      appointments_total: assertCount(appointments, 'appointments'),
      appointments_30d: assertCount(appointments30, 'appointments 30d'),
      appointments_by_status: {
        completed: assertCount(completed, 'completed'),
        no_show: assertCount(noShow, 'no_show'),
        cancelled: assertCount(cancelled, 'cancelled'),
        payment_pending: assertCount(paymentPending, 'payment_pending'),
      },
      crm_accounts: assertCount(accounts, 'accounts'),
      crm_opportunities: assertCount(opportunities, 'opportunities'),
      lead_records: assertCount(leads, 'leads'),
      payment_rows_total: paymentsQuery.count,
      payment_summaries: paymentsComplete ? [byCurrency.ARS, byCurrency.BRL] : null,
      measurement_status: {
        settled_revenue: 'NOT_MEASURABLE',
        channel_to_payer: 'NOT_MEASURABLE',
        cac: 'NOT_MEASURABLE',
        contribution_margin: 'NOT_MEASURABLE',
        repeat_purchase: 'NOT_MEASURABLE',
        b2b_revenue: 'NOT_MEASURABLE',
        brazil_vs_argentina_patients: 'NOT_MEASURABLE',
      },
      warnings: [
        'Historical records are not validated customer cohorts and may contain tests or imports.',
        'Payment approved is NOT proof of processor settlement or a performed consultation.',
        'Currency is not the country of a patient. BRL and ARS must not be summed.',
        'More than 1000 payments disables monetary totals until server-side aggregation is available.',
      ],
    }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    logger.error('[admin/commercial-intelligence] Read failed', error);
    return new Response(JSON.stringify({ error: 'commercial_metrics_unavailable' }), {
      status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
