/**
 * POST /api/doctors/prescriptions/:id/issue
 * Thin controller — delegates to issuePrescription service.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, internalError, conflict } from '@/lib/api-helpers';
import { issuePrescription } from '@/lib/prescriptions/issue-prescription.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, params, locals }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest('missing_prescription_id');

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;
    const admin = createAstroAdminClient(locals.runtime?.env);

    const result = await issuePrescription(
      admin, prescriptionId, user.id,
      locals.runtime?.env as unknown as Record<string, unknown> | undefined,
    );

    if (result.ok) {
      return jsonOk(result.data);
    }

    const errorResult = result as { ok: false; error: { code: string; details?: string } };
    const { code, details } = errorResult.error;
    if (code === 'doctor_not_found' || code === 'not_your_prescription') {
      return forbidden(code);
    }
    if ([
      'farmalink_pending_reconciliation',
      'br_requires_memed_provider',
      'ar_production_homologation_required',
      'farmalink_registration_required',
      'digital_signature_required',
      'digital_signature_failed',
      'doctor_country_mismatch',
      'patient_country_required_or_mismatched',
      'prescription_country_required',
    ].includes(code)) {
      return conflict(code);
    }
    if (code === 'farmalink_idempotency_unavailable') {
      return internalError(code);
    }
    if (code === 'update_failed') {
      return internalError('update_failed', details);
    }
    if (code === 'pdf_generation_failed') {
      return internalError('pdf_generation_failed', details);
    }
    if (code === 'pdf_upload_failed') {
      return internalError('pdf_upload_failed', details);
    }

    return badRequest(code);
  } catch (err) {
    logger.error('[issue] POST error', {
      prescriptionId,
      error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
    });
    return internalError();
  }
};
