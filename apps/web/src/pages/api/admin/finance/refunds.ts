import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

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

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok) return unauthorized('admin role required');

  try {
    const body = await request.json();
    const { paymentId, reason } = body;

    if (!paymentId) {
      return badRequest('paymentId is required');
    }

    if (!reason) {
      return badRequest('reason for refund is required');
    }

    // 1. Fetch current payment details
    const { data: payment, error: fetchErr } = await admin
      .from('appointment_payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (fetchErr || !payment) {
      return badRequest('appointment payment not found');
    }

    if (payment.status !== 'approved') {
      return badRequest(`cannot refund payment in '${payment.status}' status`);
    }

    // 2. Perform updates to mark payment as refunded
    const updatedMetadata = {
      ...(payment.metadata || {}),
      refund_reason: reason,
      refunded_by: auth.userId,
      refunded_at: new Date().toISOString(),
    };

    const { error: updatePaymentErr } = await admin
      .from('appointment_payments')
      .update({
        status: 'refunded',
        metadata: updatedMetadata,
      })
      .eq('id', paymentId);

    if (updatePaymentErr) throw updatePaymentErr;

    // 3. Find and cancel associated doctor earnings
    const { data: earning } = await admin
      .from('doctor_earnings')
      .select('id, status, metadata')
      .eq('appointment_payment_id', paymentId)
      .maybeSingle();

    if (earning) {
      const updatedEarningMetadata = {
        ...(earning.metadata || {}),
        cancelled_reason: `refunded: ${reason}`,
        cancelled_by: auth.userId,
      };

      const { error: updateEarningErr } = await admin
        .from('doctor_earnings')
        .update({
          status: 'cancelled',
          metadata: updatedEarningMetadata,
        })
        .eq('id', earning.id);

      if (updateEarningErr) {
        logger.error(`[api/admin/finance/refunds] Failed to cancel earning for payment ${paymentId}`, updateEarningErr);
      }
    }

    return jsonOk({
      success: true,
      message: 'Transaction refunded and corresponding doctor earnings cancelled successfully.',
    });
  } catch (err) {
    logger.error('[api/admin/finance/refunds] POST failed', err);
    return internalError('failed to refund transaction');
  }
};
