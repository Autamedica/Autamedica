/**
 * POST /api/admin/renpre/verify
 * Admin-only: marca un registro RENPRE como verified o rejected.
 * Body: { doctorId, decision: 'verified' | 'rejected', reason? }
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { SupabaseRenpreValidator } from '@autamedica/prescriptions';
import type { DoctorId } from '@autamedica/types';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers';

async function assertAdmin(request: Request, admin: ReturnType<typeof createAstroAdminClient>): Promise<{ ok: boolean; userId?: string }> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false };
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return { ok: false };
  return { ok: true, userId: data.user.id };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin);
  if (!auth.ok || !auth.userId) return unauthorized('admin role required');

  let body: { doctorId?: string; decision?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON');
  }

  if (!body.doctorId || !body.decision) return badRequest('doctorId and decision required');
  if (body.decision !== 'verified' && body.decision !== 'rejected') {
    return badRequest("decision must be 'verified' or 'rejected'");
  }
  if (body.decision === 'rejected' && !body.reason) return badRequest('reason required when rejecting');

  try {
    const validator = new SupabaseRenpreValidator(admin);
    const doctorId = body.doctorId as DoctorId;
    if (body.decision === 'verified') {
      await validator.markVerified(doctorId, auth.userId);
    } else {
      await validator.markRejected(doctorId, auth.userId, body.reason!);
    }
    logger.info(`[admin/renpre/verify] ${body.decision} doctor=${body.doctorId} by=${auth.userId}`);
    return jsonOk({ doctorId: body.doctorId, status: body.decision });
  } catch (err) {
    logger.error('[admin/renpre/verify] failed', err);
    return internalError(err instanceof Error ? err.message : 'verify failed');
  }
};
