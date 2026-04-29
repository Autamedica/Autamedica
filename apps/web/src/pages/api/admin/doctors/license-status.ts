/**
 * POST /api/admin/doctors/license-status
 * Admin-only manual decision for national license validation.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

const LICENSE_STATUSES = ['valid', 'pending_review', 'rejected', 'exempt'] as const;

type LicenseStatus = (typeof LICENSE_STATUSES)[number];

type RequestBody = {
  userId?: string;
  doctorId?: string;
  status?: string;
  evidence?: string;
};

async function assertAdmin(
  request: Request,
  admin: ReturnType<typeof createAstroAdminClient>,
): Promise<{ ok: boolean; userId?: string }> {
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

function isLicenseStatus(value: string | undefined): value is LicenseStatus {
  return LICENSE_STATUSES.includes(value as LicenseStatus);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin);
  if (!auth.ok || !auth.userId) return unauthorized('admin role required');

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON');
  }

  if (!body.userId && !body.doctorId) return badRequest('userId or doctorId required');
  if (!isLicenseStatus(body.status)) {
    return badRequest(`status must be one of ${LICENSE_STATUSES.join(', ')}`);
  }
  if (body.status === 'rejected' && !body.evidence?.trim()) {
    return badRequest('evidence required when rejecting');
  }

  try {
    let userId = body.userId;

    if (!userId && body.doctorId) {
      const { data: doctor, error: doctorError } = await admin
        .from('doctors')
        .select('user_id')
        .eq('id', body.doctorId)
        .maybeSingle();

      if (doctorError) throw doctorError;
      if (!doctor?.user_id) return badRequest('doctor not found');
      userId = doctor.user_id;
    }

    const checkedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from('profiles')
      .update({
        sss_validation_status: body.status,
        sss_last_checked_at: checkedAt,
      })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    logger.info('[admin/doctors/license-status] updated', {
      targetUserId: userId,
      status: body.status,
      adminUserId: auth.userId,
      evidence: body.evidence?.trim() || undefined,
    });

    return jsonOk({
      userId,
      status: body.status,
      checkedAt,
    });
  } catch (err) {
    logger.error('[admin/doctors/license-status] failed', err);
    return internalError(err instanceof Error ? err.message : 'license status update failed');
  }
};
