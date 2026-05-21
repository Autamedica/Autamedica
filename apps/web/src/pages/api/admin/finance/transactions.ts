import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

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

    // Query appointment_payments with sub-joins
    let query = admin
      .from('appointment_payments')
      .select(`
        id,
        appointment_id,
        gross_amount,
        currency,
        status,
        provider,
        provider_payment_id,
        paid_at,
        created_at,
        patient:patients(
          id,
          profile:profiles(first_name, last_name, email)
        ),
        doctor:doctors(
          id,
          payout_cbu,
          payout_alias,
          profile:profiles(first_name, last_name, email)
        ),
        earning:doctor_earnings(
          id,
          net_amount,
          platform_fee_amount,
          processor_fee_amount,
          status,
          paid_at
        )
      `)
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: rawPayments, error } = await query;
    if (error) throw error;

    // Filter by search query if present
    let payments = rawPayments || [];
    if (search) {
      const lower = search.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payments = payments.filter((p: any) => {
        const patientName = `${p.patient?.profile?.first_name || ''} ${p.patient?.profile?.last_name || ''}`.toLowerCase();
        const doctorName = `${p.doctor?.profile?.first_name || ''} ${p.doctor?.profile?.last_name || ''}`.toLowerCase();
        const paymentId = (p.provider_payment_id || '').toLowerCase();
        return patientName.includes(lower) || doctorName.includes(lower) || paymentId.includes(lower);
      });
    }

    // Format list for frontend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = payments.map((p: any) => {
      const patProfile = p.patient?.profile;
      const docProfile = p.doctor?.profile;
      const earn = Array.isArray(p.earning) ? p.earning[0] : p.earning;

      return {
        id: p.id,
        appointmentId: p.appointment_id,
        grossAmount: p.gross_amount,
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        providerPaymentId: p.provider_payment_id || 'N/A',
        paidAt: p.paid_at,
        createdAt: p.created_at,
        patient: {
          id: p.patient?.id || '',
          name: patProfile ? `${patProfile.first_name} ${patProfile.last_name}` : 'Paciente Desconocido',
          email: patProfile?.email || '',
        },
        doctor: {
          id: p.doctor?.id || '',
          name: docProfile ? `${docProfile.first_name} ${docProfile.last_name}` : 'Médico Desconocido',
          email: docProfile?.email || '',
          cbu: p.doctor?.payout_cbu || null,
          alias: p.doctor?.payout_alias || null,
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
