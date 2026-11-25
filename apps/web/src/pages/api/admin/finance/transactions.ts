import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

export const prerender = false;

async function assertAdmin(
  request: Request,
  admin: ReturnType<typeof createAstroAdminClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals?: any,
): Promise<{ ok: boolean; userId?: string }> {
  if (locals?.session?.user) {
    const userId = locals.session.user.id;
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.role && ['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) {
      return { ok: true, userId };
    }
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false };

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (!profile?.role || !['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) {
    return { ok: false };
  }

  return { ok: true, userId: data.user.id };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok) return unauthorized('admin role required');

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('q') || '';
    const statusFilter = url.searchParams.get('status') || '';

    // Query flat rows and hydrate patient/doctor/earning maps cleanly in parallel
    // so PostgREST relationship ambiguity never throws 500.
    let query = admin
      .from('appointment_payments')
      .select('id, appointment_id, patient_id, doctor_id, gross_amount, currency, status, provider, provider_payment_id, metadata, paid_at, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: rawPayments, error } = await query;
    if (error) throw error;

    const basePayments = rawPayments || [];
    const paymentIds = basePayments.map((p: any) => p.id).filter(Boolean);
    const patientIds = [...new Set(basePayments.map((p: any) => p.patient_id).filter(Boolean))];
    const doctorIds = [...new Set(basePayments.map((p: any) => p.doctor_id).filter(Boolean))];

    const [
      { data: patientsRows, error: patientsErr },
      { data: doctorsRows, error: doctorsErr },
      { data: earningsRows, error: earningsErr },
    ] = await Promise.all([
      patientIds.length
        ? admin.from('patients').select('id, user_id').in('id', patientIds)
        : Promise.resolve({ data: [], error: null }),
      doctorIds.length
        ? admin.from('doctors').select('id, user_id, payout_cbu, payout_alias').in('id', doctorIds)
        : Promise.resolve({ data: [], error: null }),
      paymentIds.length
        ? admin
            .from('doctor_earnings')
            .select('id, appointment_payment_id, net_amount, platform_fee_amount, processor_fee_amount, status, paid_at')
            .in('appointment_payment_id', paymentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (patientsErr) throw patientsErr;
    if (doctorsErr) throw doctorsErr;
    if (earningsErr) throw earningsErr;

    const userIds = [
      ...new Set([
        ...(patientsRows || []).map((row: any) => row.user_id).filter(Boolean),
        ...(doctorsRows || []).map((row: any) => row.user_id).filter(Boolean),
      ]),
    ];

    const { data: profilesRows, error: profilesErr } = userIds.length
      ? await admin.from('profiles').select('user_id, first_name, last_name, email').in('user_id', userIds)
      : { data: [], error: null };
    if (profilesErr) throw profilesErr;

    const patientById = new Map<string, any>((patientsRows || []).map((row: any) => [row.id, row]));
    const doctorById = new Map<string, any>((doctorsRows || []).map((row: any) => [row.id, row]));
    const profileByUserId = new Map<string, any>((profilesRows || []).map((row: any) => [row.user_id, row]));
    const earningByPaymentId = new Map<string, any>((earningsRows || []).map((row: any) => [row.appointment_payment_id, row]));

    // Filter by search query if present
    let payments = basePayments;
    if (search) {
      const lower = search.toLowerCase();
      payments = payments.filter((p: any) => {
        const pat = patientById.get(p.patient_id);
        const doc = doctorById.get(p.doctor_id);
        const patProfile = pat?.user_id ? profileByUserId.get(pat.user_id) : null;
        const docProfile = doc?.user_id ? profileByUserId.get(doc.user_id) : null;
        const patientName = `${patProfile?.first_name || ''} ${patProfile?.last_name || ''}`.toLowerCase();
        const doctorName = `${docProfile?.first_name || ''} ${docProfile?.last_name || ''}`.toLowerCase();
        const paymentId = (p.provider_payment_id || '').toLowerCase();
        return patientName.includes(lower) || doctorName.includes(lower) || paymentId.includes(lower);
      });
    }

    // Format list for frontend
    const formatted = payments.map((p: any) => {
      const pat = patientById.get(p.patient_id);
      const doc = doctorById.get(p.doctor_id);
      const patProfile = pat?.user_id ? profileByUserId.get(pat.user_id) : null;
      const docProfile = doc?.user_id ? profileByUserId.get(doc.user_id) : null;
      const earn = earningByPaymentId.get(p.id) ?? null;

      return {
        id: p.id,
        appointmentId: p.appointment_id,
        grossAmount: p.gross_amount,
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        providerPaymentId: p.provider_payment_id || 'N/A',
        providerStatus: typeof p.metadata?.mp_status === 'string' ? p.metadata.mp_status : null,
        providerStatusDetail: typeof p.metadata?.mp_status_detail === 'string' ? p.metadata.mp_status_detail : null,
        paidAt: p.paid_at,
        createdAt: p.created_at,
        patient: {
          id: pat?.id || p.patient_id || '',
          name: patProfile ? `${patProfile.first_name || ''} ${patProfile.last_name || ''}`.trim() || 'Paciente Desconocido' : 'Paciente Desconocido',
          email: patProfile?.email || '',
        },
        doctor: {
          id: doc?.id || p.doctor_id || '',
          name: docProfile ? `${docProfile.first_name || ''} ${docProfile.last_name || ''}`.trim() || 'Médico Desconocido' : 'Médico Desconocido',
          email: docProfile?.email || '',
          cbu: doc?.payout_cbu || null,
          alias: doc?.payout_alias || null,
        },
        earning: earn ? {
          id: earn.id,
          netAmount: earn.net_amount,
          platformFee: earn.platform_fee_amount,
          processorFee: earn.processor_fee_amount,
          status: earn.status,
          paidAt: earn.paid_at,
        } : null,
      };
    });

    return jsonOk(formatted);
  } catch (err) {
    logger.error('[api/admin/finance/transactions] GET failed', err);
    return internalError('failed to load transactions');
  }
};
