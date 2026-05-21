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
    // 1. Calculate appointment payment statistics (gross amounts)
    const { data: payments, error: paymentsErr } = await admin
      .from('appointment_payments')
      .select('gross_amount, status');

    if (paymentsErr) throw paymentsErr;

    let grossApproved = 0;
    let grossRefunded = 0;
    let grossPending = 0;

    for (const p of payments || []) {
      if (p.status === 'approved') grossApproved += p.gross_amount;
      else if (p.status === 'refunded') grossRefunded += p.gross_amount;
      else if (p.status === 'pending') grossPending += p.gross_amount;
    }

    // 2. Calculate earnings split (platform fees vs net amounts)
    const { data: earnings, error: earningsErr } = await admin
      .from('doctor_earnings')
      .select('gross_amount, platform_fee_amount, processor_fee_amount, net_amount, status');

    if (earningsErr) throw earningsErr;

    let platformFees = 0;
    let processorFees = 0;
    let pendingPayouts = 0;
    let paidPayouts = 0;

    for (const e of earnings || []) {
      if (e.status !== 'cancelled') {
        platformFees += e.platform_fee_amount;
        processorFees += e.processor_fee_amount;
      }
      if (e.status === 'pending') {
        pendingPayouts += e.net_amount;
      } else if (e.status === 'paid') {
        paidPayouts += e.net_amount;
      }
    }

    return jsonOk({
      success: true,
      summary: {
        grossApproved,
        grossRefunded,
        grossPending,
        platformFees,
        processorFees,
        pendingPayouts,
        paidPayouts,
        currency: 'ARS',
      },
    });
  } catch (err) {
    logger.error('[api/admin/finance/summary] GET failed', err);
    return internalError('failed to load financial summary');
  }
};
