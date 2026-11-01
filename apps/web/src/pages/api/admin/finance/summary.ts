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
    // Financial totals MUST be partitioned by currency.
    // These are recorded statuses, NOT amounts reconciled with the bank/PSP.
    const [{ data: payments, error: paymentsErr }, { data: earnings, error: earningsErr }] = await Promise.all([
      admin.from('appointment_payments').select('gross_amount, currency, status'),
      admin.from('doctor_earnings').select('currency, platform_fee_amount, processor_fee_amount, net_amount, status'),
    ]);
    if (paymentsErr) throw paymentsErr;
    if (earningsErr) throw earningsErr;

    type CurrencyTotals = {
      grossApproved: number;
      grossRefunded: number;
      grossPending: number;
      platformFees: number;
      processorFees: number;
      pendingPayouts: number;
      paidPayouts: number;
    };
    const byCurrency: Record<string, CurrencyTotals> = {};
    const emptyTotals = (): CurrencyTotals => ({
      grossApproved: 0, grossRefunded: 0, grossPending: 0,
      platformFees: 0, processorFees: 0, pendingPayouts: 0, paidPayouts: 0,
    });
    const totalsFor = (currency: string): CurrencyTotals => {
      if (!['ARS', 'BRL'].includes(currency)) throw new Error('unsupported_finance_currency');
      return byCurrency[currency] ?? (byCurrency[currency] = emptyTotals());
    };

    for (const payment of payments ?? []) {
      const totals = totalsFor(payment.currency);
      if (payment.status === 'approved') totals.grossApproved += payment.gross_amount;
      else if (payment.status === 'refunded') totals.grossRefunded += payment.gross_amount;
      else if (payment.status === 'pending') totals.grossPending += payment.gross_amount;
    }
    for (const earning of earnings ?? []) {
      const totals = totalsFor(earning.currency);
      if (earning.status !== 'cancelled' && earning.status !== 'refunded') {
        totals.platformFees += earning.platform_fee_amount;
        totals.processorFees += earning.processor_fee_amount;
      }
      if (earning.status === 'pending') totals.pendingPayouts += earning.net_amount;
      else if (earning.status === 'paid') totals.paidPayouts += earning.net_amount;
    }

    return jsonOk({
      success: true,
      summary: {
        byCurrency,
        amountsReconciledWithProvider: false,
        // Pending/payout/approved are database states, never bank confirmations.
        source: 'appointment_payments_and_doctor_earnings',
      },
    });
  } catch (err) {
    logger.error('[api/admin/finance/summary] GET failed', err);
    return internalError('failed to load financial summary');
  }
};
