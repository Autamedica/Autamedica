import type { APIRoute } from 'astro';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { validateEventualPatientDetails, normalizeEventualPatientDocument } from '@/lib/prescriptions/eventual-patient';

type EventualPatientRpc = {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

type EventualPatientBody = {
  fullName?: unknown;
  documentNumber?: unknown;
  birthDate?: unknown;
  gender?: unknown;
  contact?: unknown;
  consentAccepted?: unknown;
  careCountryConfirmed?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return forbidden('cross_origin_request');

  let body: EventualPatientBody;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return badRequest('request_too_large');
    body = JSON.parse(raw) as EventualPatientBody;
  } catch {
    return badRequest('invalid_json');
  }

  const admin = createAstroAdminClient(locals?.runtime?.env);
  const { data: doctor, error: doctorError } = await admin
    .from('doctors')
    .select('id, active, care_country')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (doctorError) return internalError('eventual_patient_doctor_lookup_failed');
  if (!doctor?.id || doctor.active !== true) return forbidden('doctor_profile_required');
  if (doctor.care_country !== 'AR' && doctor.care_country !== 'BR') {
    return forbidden('eventual_patient_doctor_country_invalid');
  }

  if (body.careCountryConfirmed !== true) return badRequest('external_patient_care_country_confirmation_required');

  const validationError = validateEventualPatientDetails(body, doctor.care_country);
  if (validationError) return badRequest(validationError);

  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const isEmail = contact.includes('@');
  const documentType = doctor.care_country === 'BR' ? 'CPF' : 'DNI';
  const documentNumber = normalizeEventualPatientDocument(String(body.documentNumber));
  const rpcClient = admin as unknown as EventualPatientRpc;
  const { data, error } = await rpcClient.rpc('create_doctor_eventual_patient', {
    p_doctor_id: doctor.id,
    p_care_country: doctor.care_country,
    p_full_name: String(body.fullName).trim().replace(/\\s+/g, ' '),
    p_document_type: documentType,
    p_document_number: documentNumber,
    p_birth_date: body.birthDate,
    p_gender: typeof body.gender === 'string' && body.gender ? body.gender : null,
    p_phone: contact && !isEmail ? contact : null,
    p_email: contact && isEmail ? contact : null,
    p_consent_scope: 'prescription_issuance_and_delivery',
  });

  if (error) {
    const code = error.message ?? 'eventual_patient_create_failed';
    if (code.startsWith('eventual_patient_')) return badRequest(code);
    return internalError('eventual_patient_create_failed');
  }

  const result = data as { patient_id?: unknown; reused?: unknown } | null;
  if (!result || typeof result.patient_id !== 'string' || !UUID_PATTERN.test(result.patient_id)) {
    return internalError('eventual_patient_create_failed');
  }

  const response = jsonOk({
    patientId: result.patient_id,
    reused: result.reused === true,
  }, result.reused === true ? 200 : 201);
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Pragma', 'no-cache');
  return response;
};
