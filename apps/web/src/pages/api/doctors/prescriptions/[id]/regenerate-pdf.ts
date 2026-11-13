/**
 * POST /api/doctors/prescriptions/:id/regenerate-pdf
 * Reissuance is disabled until immutable signed PDF versioning is available.
 * Never overwrite an originally issued and signed document with a new unsigned PDF.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, internalError, conflict } from '@/lib/api-helpers';
import { regenerateIssuedPrescriptionPdf } from '@/lib/prescriptions/issue-prescription.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, params, locals }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest('missing_prescription_id');

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;

    const admin = createAstroAdminClient(locals.runtime?.env);
    const result = await regenerateIssuedPrescriptionPdf(admin, prescriptionId, auth.user.id);

    if (result.ok) {
      return jsonOk(result.data);
    }

    const errorResult = result as { ok: false; error: { code: string } };
    const code = errorResult.error.code;
    if (code === 'doctor_not_found' || code === 'not_your_prescription') {
      return forbidden(code);
    }
    if (code === 'reissue_requires_verified_signature') {
      return conflict(code);
    }
    if (code === 'update_failed' || code === 'pdf_upload_failed') {
      return internalError();
    }

    return badRequest(code);
  } catch (err) {
    logger.error('[regenerate-pdf] POST error', err);
    return internalError();
  }
};
