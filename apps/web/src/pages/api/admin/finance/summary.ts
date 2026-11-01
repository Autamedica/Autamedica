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
    // Never sum distinct currencies or call an unverified approved record settled revenue.
    const { data: payments, error: paymentsErr } = await admin
      .from('appointment_payments')
      .select('gross_amount, status, currency, provider_payment_id');
    if (paymentsErr) throw paymentsErr;

    const { data: earnings, error: earningsErr } = await admin
      .from('doctor_earnings')
      .select('platform_fee_amount, processor_fee_amount, net_amount, status, currency');
    if (earningsErr) throw earningsErr;

    const blank = () => ({
      grossApproved: 0, grossRefunded: 0, grossPending: 0,
      approvedMissingProviderId: 0,
      platformFees: 0, processorFees: 0, pendingPayouts: 0, paidPayouts: 0,
    });
    const byCurrency = { ARS: blank(), BRL: blank() };
    const validCurrency = (currency: string): currency is 'ARS' | 'BRL' =>
      currency === 'ARS' || currency === 'BRL';

    for (const p of payments || []) {
      if (!validCurrency(p.currency)) throw new Error('Unknown currency in payment summary');
      const totals = byCurrency[p.currency];
      if (p.status === 'approved') {
        totals.grossApproved += p.gross_amount;
        if (!p.provider_payment_id) totals.approvedMissingProviderId++;
      } else if (p.status === 'refunded') totals.grossRefunded += p.gross_amount;
      else if (p.status === 'pending') totals.grossPending += p.gross_amount;
    }
    for (const e of earnings || []) {
      if (!validCurrency(e.currency)) throw new Error('Unknown currency in earnings summary');
      const totals = byCurrency[e.currency];
      if (e.status !== 'cancelled') {
        totals.platformFees += e.platform_fee_amount;
        totals.processorFees += e.processor_fee_amount;
      }
      if (e.status === 'pending') totals.pendingPayouts += e.net_amount;
      else if (e.status === 'paid') totals.paidPayouts += e.net_amount;
    }

    const response = jsonOk({
      success: true,
      summary: {
        byCurrency,
        reconciledRevenue: null,
        // Payment approved != settlement; doctor earning paid != verified transfer.
        verificationStatus: 'unreconciled',
      },
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (err) {
    logger.error('[api/admin/finance/summary] GET failed', err);
    return internalError('failed to load financial summary');
  }
};
