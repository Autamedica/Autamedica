import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import {
  computePrescriptionRenewalStatus,
  isValidUuid,
  resolveActiveDoctorId,
  verifyDoctorPatientAccess,
  type RawPrescriptionRow,
} from '@/lib/doctors/services/patient-clinical-workspace';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

export const GET: APIRoute = async ({ params, request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const patientId = params.patientId?.trim() ?? '';
  if (!isValidUuid(patientId)) return badRequest('invalid_patient_id');

  const admin = createAstroAdminClient(locals?.runtime?.env) as unknown as SupabaseClient;
  const doctor = await resolveActiveDoctorId(admin, auth.user.id);
  if (!doctor) return forbidden('doctor_profile_required');

  if (!(await verifyDoctorPatientAccess(admin, doctor.id, patientId))) {
    return forbidden('forbidden_patient_access');
  }

  const { data, error } = await admin
    .from('prescriptions')
    .select('id, cuir, status, created_at, expires_at, clinical_data, signed_pdf_url')
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    logger.error('[api/doctors/patients/prescriptions] GET failed', error);
    return internalError('patient_prescriptions_fetch_failed');
  }

  const now = new Date();
  const prescriptions = ((data ?? []) as RawPrescriptionRow[]).map((row) =>
    computePrescriptionRenewalStatus(row, now),
  );

  const expiringCount = prescriptions.filter((p) => p.renewalStatus === 'expiring_soon').length;
  const expiredCount = prescriptions.filter((p) => p.renewalStatus === 'expired').length;

  return jsonOk({ prescriptions, expiringCount, expiredCount });
};
