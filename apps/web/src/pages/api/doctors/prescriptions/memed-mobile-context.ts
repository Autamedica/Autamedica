/**
 * Mobile-only Memed bridge; user MUST log in as same doctor in browser.
 * This endpoint does not create or sign any prescription.
 */
import type { APIRoute } from 'astro';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveMemedPatient } from '@/lib/prescriptions/brazil/memed-patient';
import { isMemedMobileEnabled, isMemedPilotDoctor } from '@/lib/prescriptions/brazil/memed-pilot';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const GET: APIRoute = async ({request, locals}) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  // Clinical issuance remains separately gated; never open the SDK on a
  // mobile route when the existing clinical pilot is disabled.
  if (!isMemedMobileEnabled(locals.runtime?.env as unknown as Record<string, unknown> | undefined)) {
    return forbidden('memed_mobile_not_enabled');
  }
  const params = new URL(request.url).searchParams;
  const appointmentId = params.get('appointmentId') ?? '';
  const requestId = params.get('requestId') ?? '';
  const directPatientId = params.get('patientId') ?? '';
  const isAppointment = UUID.test(appointmentId) && !requestId && !directPatientId;
  const isDispatch = UUID.test(requestId) && !appointmentId && !directPatientId;
  const isPatient = UUID.test(directPatientId) && !appointmentId && !requestId;
  if (!isAppointment && !isDispatch && !isPatient) return badRequest('invalid_encounter');
  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const {data: profile, error: profileError} = await admin.from('profiles')
      .select('active').eq('user_id', auth.user.id).maybeSingle();
    if (profileError || profile?.active !== true) {
      return forbidden('active_doctor_profile_required');
    }
    const {data: doctor, error: doctorError} = await admin.from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, care_country')
      .eq('user_id', auth.user.id).maybeSingle();
    if (doctorError || !doctor?.active || doctor.license_type !== 'CRM' ||
      doctor.care_country !== 'BR' ||
      !isMemedPilotDoctor(locals.runtime?.env as unknown as Record<string, unknown> | undefined, doctor.id)) {
      return forbidden('memed_pilot_doctor_required');
    }
    const {data: licenses, error: licenseError} = await admin.from('doctor_licenses')
      .select('license_number, uf_brazil, status, cfm_validation_status, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at, cfm_last_checked_at')
      .eq('doctor_id', doctor.id).eq('license_type', 'CRM').limit(20);
    const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
    const validLicense = !licenseError && licenses?.some(lic =>
      lic.status === 'active' && lic.cfm_validation_status === 'valid' &&
      digits(lic.license_number) === digits(doctor.license_number) &&
      lic.uf_brazil?.toUpperCase() === doctor.uf_brazil?.toUpperCase() &&
      Boolean(lic.cfm_evidence_path?.trim()) &&
      (lic.cfm_review_notes?.trim().length ?? 0) >= 10 &&
      Boolean(lic.cfm_reviewed_by && lic.cfm_reviewed_at && lic.cfm_last_checked_at));
    if (!validLicense) return forbidden('verified_crm_required');
    let patientId: string | null = null;
    if (isAppointment) {
      const {data: appt, error: apptError} = await admin.from('appointments')
        .select('doctor_id, patient_id, status, start_time, type')
        .is('deleted_at', null)
        .eq('id', appointmentId).eq('doctor_id', doctor.id).maybeSingle();
      const start = appt?.start_time ? Date.parse(appt.start_time) : NaN;
      if (apptError || appt?.type !== 'telemedicine' ||
        !['in_progress', 'completed'].includes(appt?.status ?? '') ||
        !Number.isFinite(start) || start < Date.now() - 24 * 60 * 60_000 || start > Date.now() + 5 * 60_000) {
        return forbidden('clinical_encounter_required');
      }
      patientId = appt.patient_id;
    } else if (isDispatch) {
      const {data: dispatch, error: dispatchError} = await admin.from('pharmacy_dispatch_requests')
        .select('assigned_doctor_id, patient_id, status, call_started_at')
        .eq('id', requestId).maybeSingle();
      const started = dispatch?.call_started_at ? Date.parse(dispatch.call_started_at) : NaN;
      if (dispatchError || dispatch?.assigned_doctor_id !== doctor.id || !dispatch.patient_id ||
        !['in_call', 'completed'].includes(dispatch.status) ||
        !Number.isFinite(started) || started < Date.now() - 24 * 60 * 60_000 ||
        started > Date.now() + 5 * 60_000) {
        return forbidden('clinical_encounter_required');
      }
      patientId = dispatch.patient_id;
    } else {
      patientId = directPatientId;
    }
    if (!patientId) return forbidden('clinical_encounter_required');
    // Reuse the same patient access policy as /memed-token: consent, country,
    // linked doctor-patient encounter and verified identification.
    await resolveMemedPatient(admin, doctor.id, patientId);
    const response = jsonOk({patientId});
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if ([
      'doctor_patient_access_required',
      'clinical_encounter_required',
      'memed_patient_country_required',
      'memed_patient_consent_required',
    ].includes(code)) {
      return forbidden(code);
    }
    if ([
      'memed_patient_identity_incomplete',
      'memed_patient_demographics_invalid',
    ].includes(code)) {
      return badRequest(code);
    }
    return internalError('memed_mobile_context_unavailable');
  }
};
