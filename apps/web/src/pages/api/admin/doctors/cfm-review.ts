import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';
import {
  cfmStatusToLicenseStatus,
  evidenceExtension,
  isValidCfmEvidenceSignature,
  validateCfmReviewInput,
  type CfmReviewStatus,
} from '@/lib/admin/cfm-manual-review';

const EVIDENCE_BUCKET = 'doctor-credential-evidence';

async function assertAdmin(
  request: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals: any,
  admin: ReturnType<typeof createAstroAdminClient>,
): Promise<{ ok: boolean; userId?: string }> {
  let userId = locals?.session?.user?.id as string | undefined;

  if (!userId) {
    const authHeader = request.headers.get('authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return { ok: false };

    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return { ok: false };
    userId = data.user.id;
  }

  const { data: profile, error } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !profile?.role || !['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) {
    return { ok: false };
  }

  return { ok: true, userId };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, locals, admin);
  if (!auth.ok || !auth.userId) return unauthorized('admin role required');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('multipart form data required');
  }

  const licenseId = form.get('licenseId');
  const status = form.get('status');
  const reviewNotes = form.get('reviewNotes');
  const evidenceEntry = form.get('evidence');

  if (typeof licenseId !== 'string' || !licenseId.trim()) return badRequest('licenseId is required');
  if (typeof status !== 'string') return badRequest('status is required');
  if (typeof reviewNotes !== 'string') return badRequest('review notes are required');

  const evidence = evidenceEntry instanceof File && evidenceEntry.size > 0 ? evidenceEntry : null;
  if (evidenceEntry !== null && typeof evidenceEntry !== 'string' && !(evidenceEntry instanceof File)) {
    return badRequest('invalid evidence file');
  }

  const validationError = validateCfmReviewInput({
    status,
    reviewNotes,
    evidence: evidence ? { type: evidence.type, size: evidence.size } : null,
  });
  if (validationError) return badRequest(validationError);

  const decision = status as CfmReviewStatus;

  let uploadedPath: string | null = null;
  try {
    const { data: license, error: licenseError } = await admin
      .from('doctor_licenses')
      .select('id, doctor_id, license_type, uf_brazil, cfm_evidence_path')
      .eq('id', licenseId.trim())
      .maybeSingle();

    if (licenseError) throw licenseError;
    if (!license) return badRequest('CRM license not found');
    if (license.license_type !== 'CRM' || !license.uf_brazil) {
      return badRequest('manual CFM review is available only for CRM registrations with a Brazilian state');
    }

    let evidenceBytes: Uint8Array | null = null;
    let extension: 'pdf' | 'jpg' | 'png' | null = null;

    if (evidence) {
      extension = evidenceExtension(evidence.type);
      evidenceBytes = new Uint8Array(await evidence.arrayBuffer());
      if (!extension || !isValidCfmEvidenceSignature(evidence.type, evidenceBytes)) {
        return badRequest('evidence file content does not match its PDF/JPG/PNG format');
      }

      uploadedPath = `${license.doctor_id}/${license.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await admin.storage
        .from(EVIDENCE_BUCKET)
        .upload(uploadedPath, evidenceBytes, {
          contentType: evidence.type,
          cacheControl: '3600',
          upsert: false,
        });
      if (uploadError) throw uploadError;
    }

    const checkedAt = new Date().toISOString();
    const update = {
      cfm_validation_status: decision,
      cfm_last_checked_at: checkedAt,
      cfm_review_notes: reviewNotes.trim(),
      cfm_reviewed_by: auth.userId,
      cfm_reviewed_at: checkedAt,
      status: cfmStatusToLicenseStatus(decision),
      ...(uploadedPath ? { cfm_evidence_path: uploadedPath } : {}),
    };

    const { data: updatedLicense, error: updateError } = await admin
      .from('doctor_licenses')
      .update(update)
      .eq('id', license.id)
      .select('id, doctor_id, license_number, license_type, uf_brazil, status, cfm_validation_status, cfm_last_checked_at, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at')
      .single();

    if (updateError) throw updateError;

    let evidenceUrl: string | null = null;
    if (updatedLicense.cfm_evidence_path) {
      const { data: signed, error: signedError } = await admin.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(updatedLicense.cfm_evidence_path, 10 * 60);
      if (signedError) {
        logger.warn('[admin/doctors/cfm-review] evidence link could not be signed', { licenseId: license.id });
      } else {
        evidenceUrl = signed.signedUrl;
      }
    }

    logger.info('[admin/doctors/cfm-review] manual decision saved', {
      licenseId: license.id,
      doctorId: license.doctor_id,
      status: decision,
      reviewerId: auth.userId,
      evidenceAttached: Boolean(updatedLicense.cfm_evidence_path),
    });

    return jsonOk({ license: { ...updatedLicense, cfm_evidence_url: evidenceUrl } });
  } catch (err) {
    if (uploadedPath) {
      const { error: cleanupError } = await admin.storage.from(EVIDENCE_BUCKET).remove([uploadedPath]);
      if (cleanupError) logger.warn('[admin/doctors/cfm-review] orphan evidence cleanup failed', { cleanupError });
    }
    logger.error('[admin/doctors/cfm-review] failed', err);
    return internalError(err instanceof Error ? err.message : 'manual CFM review failed');
  }
};
