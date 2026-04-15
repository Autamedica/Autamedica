/**
 * POST /api/doctors/prescriptions/:id/issue
 * Thin controller — delegates to issuePrescription service.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';
import { issuePrescription } from '@/lib/prescriptions/issue-prescription.service';

export const POST: APIRoute = async ({ request, params }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest('missing_prescription_id');

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user, supabase } = auth;

    const result = await issuePrescription(supabase, prescriptionId, user.id);

    if (result.ok) {
      return jsonOk(result.data);
    }

    const errorResult = result as { ok: false; error: { code: string } };
    const code = errorResult.error.code;
    if (code === 'doctor_not_found' || code === 'not_your_prescription') {
      return forbidden(code);
    }
    if (code === 'update_failed') {
      return internalError();
    }

    return badRequest(code);
  } catch (err) {
    logger.error('[issue] POST error', err);
    return internalError();
  }
};
