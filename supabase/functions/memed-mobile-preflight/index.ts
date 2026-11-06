/**
 * Android -> Memed mobile handoff. READ-ONLY preflight; never emits prescriptions.
 * The browser uses its own authenticated doctor session. No provider tokens,
 * patient details or Supabase JWT are ever encoded in the returned URL.
 */
import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/auth-helpers.ts';
import {
  appointmentPermitsPrescription,
  buildMemedMobileLaunchUrl,
  validMemedMobileAppointment,
  verifiedBrazilLicense,
  validBrazilPatientIdentity,
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
    if (Deno.env.get('MEMED_MOBILE_ENABLED') !== 'true') {
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
    if (Object.keys(payload).length !== 1 || !validMemedMobileAppointment(payload.appointmentId)) {
      return reply({code: 'INVALID_APPOINTMENT'}, 400, cors);
    }
    const appointmentId = payload.appointmentId;
    const {serviceClient: db, user} = auth;
    const {data: profile, error: profileError} = await db.from('profiles')
      .select('role').eq('user_id', user.id).maybeSingle();
    if (profileError || !DOCTOR_ROLES.has(profile?.role ?? '')) return reply({code: 'DOCTOR_REQUIRED'}, 403, cors);
    const {data: doctor, error: doctorError} = await db.from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, care_country')
      .eq('user_id', user.id).maybeSingle();
    const pilotId = Deno.env.get('MEMED_MOBILE_PILOT_DOCTOR_ID');
    if (doctorError || !doctor || !pilotId || pilotId !== doctor.id) {
      return reply({code: 'PILOT_DOCTOR_REQUIRED'}, 403, cors);
    }
    const {data: licenses, error: licenseError} = await db.from('doctor_licenses')
      .select('license_number, uf_brazil, status, cfm_validation_status')
      .eq('doctor_id', doctor.id).eq('license_type', 'CRM').limit(20);
    if (licenseError || !verifiedBrazilLicense(doctor, licenses ?? [])) {
      return reply({code: 'CFM_LICENSE_NOT_VERIFIED'}, 403, cors);
    }
    const {data: appointment, error: apptError} = await db.from('appointments')
      .select('doctor_id, patient_id, status, start_time, end_time')
      .eq('id', appointmentId).eq('doctor_id', doctor.id).maybeSingle();
    if (apptError || !appointment || !appointmentPermitsPrescription(
      appointment.status, appointment.start_time, appointment.end_time, Date.now(),
    )) return reply({code: 'CLINICAL_ENCOUNTER_REQUIRED'}, 403, cors);
    const {data: patient, error: patientError} = await db.from('patients')
      .select('id, active, care_country, lgpd_consent, cpf, birth_date, gender')
      .eq('id', appointment.patient_id).maybeSingle();
    if (patientError || patient?.active !== true || patient.care_country !== 'BR' ||
      patient.lgpd_consent !== true) return reply({code: 'BRAZIL_PATIENT_CONSENT_REQUIRED'}, 403, cors);
    if (!validBrazilPatientIdentity(patient.cpf, patient.birth_date, patient.gender, Date.now())) {
      return reply({code: 'PATIENT_IDENTITY_INCOMPLETE'}, 403, cors);
    }
    return reply({
      success: true,
      launchUrl: buildMemedMobileLaunchUrl(appointmentId),
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

Deno.serve(handler);
