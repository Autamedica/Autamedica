/**
 * Android -> Memed mobile handoff. READ-ONLY preflight; never emits prescriptions.
 * The browser uses its own authenticated doctor session. No provider tokens,
 * patient details or Supabase JWT are ever encoded in the returned URL.
 */
import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/auth-helpers.ts';
import { withEdgeSentry } from '../_shared/sentry.ts';
import {
  appointmentPermitsPrescription,
  buildMemedMobileLaunchUrl,
  validMemedMobileAppointment,
  verifiedBrazilLicense,
  validBrazilPatientIdentity,
  memedMobileFeatureEnabled,
  resolveMemedMobilePilotDoctorId,
} from '../_shared/memed-mobile-policy.ts';

const NO_STORE = {'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer'};
const DOCTOR_ROLES = new Set(['doctor', 'admin', 'platform_admin', 'organization_admin']);
const reply = (payload: Record<string, unknown>, status: number, cors: Record<string, string>) => {
  const r = jsonResponse(payload, status, cors);
  for (const [key, val] of Object.entries(NO_STORE)) r.headers.set(key, val);
  return r;
};

export async function handler(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', {headers: cors});
  if (req.method !== 'POST') return reply({code: 'METHOD_NOT_ALLOWED'}, 405, cors);
  try {
    const auth = await requireAuth(req, cors);
    // Fail closed until a verified live pilot is explicitly provisioned.
    if (!memedMobileFeatureEnabled(Deno.env.get('MEMED_MOBILE_ENABLED'), Deno.env.get('MEMED_RX_ENABLED'))) {
      return reply({code: 'MEMED_MOBILE_DISABLED'}, 503, cors);
    }
    const bodyText = await req.text();
    if (bodyText.length > 500) return reply({code: 'INVALID_REQUEST'}, 400, cors);
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(bodyText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      payload = parsed as Record<string, unknown>;
    } catch {
      return reply({code: 'INVALID_REQUEST'}, 400, cors);
    }
    const isAppointment = Object.keys(payload).length === 1 && validMemedMobileAppointment(payload.appointmentId);
    const isDispatch = Object.keys(payload).length === 1 && validMemedMobileAppointment(payload.requestId);
    if (!isAppointment && !isDispatch) return reply({code: 'INVALID_ENCOUNTER'}, 400, cors);
    const appointmentId = isAppointment ? payload.appointmentId as string : null;
    const requestId = isDispatch ? payload.requestId as string : null;
    const {serviceClient: db, user} = auth;
    const {data: profile, error: profileError} = await db.from('profiles')
      .select('role, active').eq('user_id', user.id).maybeSingle();
    if (profileError || profile?.active !== true || !DOCTOR_ROLES.has(profile?.role ?? '')) return reply({code: 'DOCTOR_REQUIRED'}, 403, cors);
    const {data: doctor, error: doctorError} = await db.from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, care_country')
      .eq('user_id', user.id).maybeSingle();
    const pilotId = resolveMemedMobilePilotDoctorId(
      Deno.env.get('MEMED_MOBILE_PILOT_DOCTOR_ID'),
      Deno.env.get('MEMED_PILOT_DOCTOR_ID'),
    );
    if (doctorError || !doctor || !pilotId || pilotId !== doctor.id) {
      return reply({code: 'PILOT_DOCTOR_REQUIRED'}, 403, cors);
    }
    const {data: licenses, error: licenseError} = await db.from('doctor_licenses')
      .select('license_number, uf_brazil, status, cfm_validation_status')
      .eq('doctor_id', doctor.id).eq('license_type', 'CRM').limit(20);
    if (licenseError || !verifiedBrazilLicense(doctor, licenses ?? [])) {
      return reply({code: 'CFM_LICENSE_NOT_VERIFIED'}, 403, cors);
    }
    let patientId: string | null = null;
    if (appointmentId) {
      const {data: appointment, error: apptError} = await db.from('appointments')
        .select('doctor_id, patient_id, status, start_time, end_time, type')
        .is('deleted_at', null)
        .eq('id', appointmentId).eq('doctor_id', doctor.id).maybeSingle();
      if (apptError || !appointment || !appointmentPermitsPrescription(
        appointment.status, appointment.start_time, appointment.end_time, Date.now(), appointment.type,
      )) return reply({code: 'CLINICAL_ENCOUNTER_REQUIRED'}, 403, cors);
      patientId = appointment.patient_id;
    } else if (requestId) {
      const {data: dispatch, error: dispatchError} = await db.from('pharmacy_dispatch_requests')
        .select('assigned_doctor_id, patient_id, status, call_started_at')
        .eq('id', requestId).maybeSingle();
      const callStarted = dispatch?.call_started_at ? Date.parse(dispatch.call_started_at) : NaN;
      if (dispatchError || !dispatch || dispatch.assigned_doctor_id !== doctor.id ||
        !dispatch.patient_id || !['in_call', 'completed'].includes(dispatch.status) ||
        !Number.isFinite(callStarted) || callStarted < Date.now() - 24 * 60 * 60_000 ||
        callStarted > Date.now() + 5 * 60_000) {
        return reply({code: 'CLINICAL_ENCOUNTER_REQUIRED'}, 403, cors);
      }
      patientId = dispatch.patient_id;
    }
    if (!patientId) return reply({code: 'CLINICAL_ENCOUNTER_REQUIRED'}, 403, cors);
    const {data: patient, error: patientError} = await db.from('patients')
      .select('id, user_id, active, care_country, lgpd_consent, lgpd_consent_date, cpf, birth_date, gender')
      .eq('id', patientId).maybeSingle();
    if (patientError || patient?.active !== true || patient.care_country !== 'BR' ||
      patient.lgpd_consent !== true || !patient.lgpd_consent_date || !patient.user_id) {
      return reply({code: 'BRAZIL_PATIENT_CONSENT_REQUIRED'}, 403, cors);
    }
    const {data: patientProfile, error: patientProfileError} = await db.from('profiles')
      .select('active').eq('user_id', patient.user_id).maybeSingle();
    if (patientProfileError || patientProfile?.active !== true) {
      return reply({code: 'PATIENT_ACCOUNT_INACTIVE'}, 403, cors);
    }
    if (!validBrazilPatientIdentity(patient.cpf, patient.birth_date, patient.gender, Date.now())) {
      return reply({code: 'PATIENT_IDENTITY_INCOMPLETE'}, 403, cors);
    }
    return reply({
      success: true,
      launchUrl: buildMemedMobileLaunchUrl(appointmentId ?? requestId!, appointmentId ? 'appointmentId' : 'requestId'),
      requiresBrowserSignIn: true,
      provider: 'memed',
      country: 'BR',
      // NO bearer token, Memed doctor token, CPF, name or patient ID.
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return reply({code: 'MEMED_MOBILE_PREFLIGHT_ERROR'}, 500, cors);
  }
}

Deno.serve(withEdgeSentry('memed-mobile-preflight', handler))
