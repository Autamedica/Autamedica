/**
 * Mobile-only Memed bridge; user MUST log in as same doctor in browser.
 * This endpoint does not create or sign any prescription.
 */
import type { APIRoute } from 'astro';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveMemedPatient } from '@/lib/prescriptions/brazil/memed-patient';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const GET: APIRoute = async ({request, locals}) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  // Clinical issuance remains separately gated; never open the SDK on a
  // mobile route when the existing clinical pilot is disabled.
  if (locals.runtime?.env?.MEMED_RX_ENABLED !== 'true' ||
      locals.runtime?.env?.MEMED_MOBILE_ENABLED !== 'true') {
    return forbidden('memed_mobile_not_enabled');
  }
  const appointmentId = new URL(request.url).searchParams.get('appointmentId') ?? '';
  if (!UUID.test(appointmentId)) return badRequest('invalid_appointment');
  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const {data: doctor, error: doctorError} = await admin.from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, care_country')
      .eq('user_id', auth.user.id).maybeSingle();
    if (doctorError || !doctor?.active || doctor.license_type !== 'CRM' ||
      doctor.care_country !== 'BR' ||
      doctor.id !== locals.runtime?.env?.MEMED_PILOT_DOCTOR_ID) {
      return forbidden('memed_pilot_doctor_required');
    }
    const {data: licenses, error: licenseError} = await admin.from('doctor_licenses')
      .select('license_number, uf_brazil, status, cfm_validation_status')
      .eq('doctor_id', doctor.id).eq('license_type', 'CRM').limit(20);
    const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
    const validLicense = !licenseError && licenses?.some(lic =>
      lic.status === 'active' && lic.cfm_validation_status === 'valid' &&
      digits(lic.license_number) === digits(doctor.license_number) &&
      lic.uf_brazil?.toUpperCase() === doctor.uf_brazil?.toUpperCase());
    if (!validLicense) return forbidden('verified_crm_required');
    const {data: appt, error: apptError} = await admin.from('appointments')
      .select('doctor_id, patient_id, status, start_time, type')
      .is('deleted_at', null)
      .eq('id', appointmentId).eq('doctor_id', doctor.id).maybeSingle();
    const start = appt?.start_time ? Date.parse(appt.start_time) : NaN;
    if (apptError || !appt || appt.type !== 'telemedicine' ||
      !['in_progress', 'completed'].includes(appt.status) ||
      !Number.isFinite(start) || start < Date.now() - 24 * 60 * 60_000 || start > Date.now() + 5 * 60_000) {
      return forbidden('clinical_encounter_required');
    }
    // Reuse the same patient access policy as /memed-token: consent, country,
    // linked doctor-patient encounter and verified identification.
    await resolveMemedPatient(admin, doctor.id, appt.patient_id);
    const response = jsonOk({patientId: appt.patient_id});
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    return internalError('memed_mobile_context_unavailable');
  }
};
