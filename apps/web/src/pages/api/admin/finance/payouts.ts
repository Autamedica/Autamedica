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
    const { earningId, paymentReference } = body;

    if (!earningId) {
      return badRequest('earningId is required');
    }

    if (!paymentReference) {
      return badRequest('paymentReference is required to record the bank transfer');
    }

    // 1. Fetch current earning to verify it's pending
    const { data: earning, error: fetchErr } = await admin
      .from('doctor_earnings')
      .select('*')
      .eq('id', earningId)
      .single();

    if (fetchErr || !earning) {
      return badRequest('doctor earning record not found');
    }

    if (earning.status !== 'pending') {
      return badRequest(`cannot pay earning in '${earning.status}' status`);
    }

    // 2. Mark as paid, record metadata and timestamp
    const updatedMetadata = {
      ...(earning.metadata as Record<string, unknown> || {}),
      payment_reference: paymentReference,
      payout_approved_by: auth.userId,
    };

    const { error: updateErr } = await admin
      .from('doctor_earnings')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        metadata: updatedMetadata,
      })
      .eq('id', earningId);

    if (updateErr) throw updateErr;

    return jsonOk({
      success: true,
      message: 'Payout registered and marked as paid successfully.',
    });
  } catch (err) {
    logger.error('[api/admin/finance/payouts] POST failed', err);
    return internalError('failed to register payout');
  }
};
