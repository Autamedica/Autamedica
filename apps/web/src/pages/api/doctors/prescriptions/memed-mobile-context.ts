/**
 * Mobile-only Memed bridge; relies on the verified SSR doctor session cookies
 * issued by `/api/doctors/memed-mobile/session-exchange` (or active web session).
 * This endpoint does not create or sign any prescription.
 */
import type { APIRoute } from 'astro';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveMemedPatient } from '@/lib/prescriptions/brazil/memed-patient';
import { verifyAuthorizedMemedMobileDoctor } from '@/lib/prescriptions/brazil/memed-mobile-handoff';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const GET: APIRoute = async ({request, locals}) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  const runtimeEnv = locals.runtime?.env as unknown as Record<string, unknown> | undefined;
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
    const doctorAuth = await verifyAuthorizedMemedMobileDoctor(admin, auth.user.id, runtimeEnv);
    if (!doctorAuth.ok || !doctorAuth.doctor) {
      return forbidden(doctorAuth.reason ?? 'memed_pilot_doctor_required');
    }
    const doctor = doctorAuth.doctor;
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
