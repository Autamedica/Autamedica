/**
 * Brazil-only Memed gateway. The server owns the doctor identity and patient linkage.
 * This endpoint must never invent CRM, CPF, age, or a successful prescription.
 */
import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { badRequest, forbidden, internalError, jsonOk, serviceUnavailable } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { doctorHasPatientAccess } from '@/lib/doctors/lib/resolve-room';
import { MemedService } from '@/lib/prescriptions/brazil/memed.service';
import { logger } from '@autamedica/shared';

const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_CPF = /^\d{11}$/;
const VALID_UF = /^[A-Z]{2}$/;
const VALID_MEMED_ID = /^[A-Za-z0-9_-]{1,100}$/;

function digits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatBirthDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function memedEnvironment(env: Record<string, string | undefined>) {
  const mode = env.MEMED_ENV;
  if (mode !== 'production' && mode !== 'homologation') return null;
  const expected = mode === 'production'
    ? { api: 'https://api.memed.com.br/v1', script: 'https://partners.memed.com.br/integration.js' }
    : { api: 'https://integrations.api.memed.com.br/v1', script: 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js' };
  if (env.MEMED_API_URL !== expected.api || env.MEMED_SCRIPT_URL !== expected.script) return null;
  if (!env.MEMED_API_KEY || !env.MEMED_SECRET_KEY) return null;
  return { ...expected, mode };
}

async function getContext(request: Request, locals: App.Locals, patientId: string) {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return { response: auth };
  if (!VALID_UUID.test(patientId)) return { response: badRequest('patient_id_required') };
  const admin = createAstroAdminClient(locals.runtime?.env);
  // The new birth-date column is created in this PR's migration; the
  // generated Database type will include it after migration/type refresh.
  const newSchemaAdmin = admin as unknown as SupabaseClient;
  const { data: doctor } = await newSchemaAdmin
    .from('doctors')
    .select('id, active, license_type, license_number, uf_brazil, cpf, specialty, user_id, memed_birth_date')
    .eq('user_id', auth.user.id).maybeSingle();
  if (!doctor?.id || doctor.active !== true || doctor.license_type !== 'CRM') {
    return { response: forbidden('active_br_doctor_required') };
  }
  const allowed = await doctorHasPatientAccess(admin, doctor.id, patientId);
  if (!allowed) return { response: forbidden('forbidden_patient_access') };
  const { data: patient } = await admin
    .from('patients')
    .select('id, user_id, cpf, birth_date, gender, active')
    .eq('id', patientId).maybeSingle();
  if (!patient || patient.active === false || !patient.user_id) {
    return { response: badRequest('registered_patient_required') };
  }
  const { data: doctorProfile } = await admin.from('profiles')
    .select('first_name, last_name, email, phone, cpf')
    .eq('user_id', auth.user.id).maybeSingle();
  const { data: patientProfile } = await admin.from('profiles')
    .select('first_name, last_name, email, phone, cpf')
    .eq('user_id', patient.user_id).maybeSingle();
  const doctorCpf = digits(doctor.cpf || doctorProfile?.cpf);
  const patientCpf = digits(patient.cpf || patientProfile?.cpf);
  const doctorName = [doctorProfile?.first_name, doctorProfile?.last_name].filter(Boolean).join(' ').trim();
  const patientName = [patientProfile?.first_name, patientProfile?.last_name].filter(Boolean).join(' ').trim();
  const uf = (doctor.uf_brazil || '').trim().toUpperCase();
  const crm = digits(doctor.license_number);
  const birthDate = formatBirthDate(patient.birth_date);
  const patientGender = String(patient.gender || '').toLowerCase();
  const sex = patientGender.startsWith('f') ? 'Feminino'
    : patientGender.startsWith('m') ? 'Masculino' : null;
  if (!VALID_CPF.test(doctorCpf) || doctorCpf === '00000000000'
    || !crm || !VALID_UF.test(uf) || !doctorProfile?.email || !doctorName) {
    return { response: badRequest('doctor_memed_identity_incomplete') };
  }
  if (!VALID_CPF.test(patientCpf) || patientCpf === '00000000000'
    || !patientName || !birthDate || !sex || !patientProfile?.email || !patientProfile?.phone) {
    return { response: badRequest('patient_memed_identity_incomplete') };
  }

  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(locals.runtime?.env ?? {})) {
    if (typeof value === 'string') env[key] = value;
  }
  if (env.MEMED_BR_ENABLED !== 'true' || !memedEnvironment(env)) {
    return { response: serviceUnavailable('memed_br_not_configured') };
  }

  return {
    admin, doctor, auth, env,
    doctorData: {
      externalId: doctor.id, nome: doctorProfile.first_name || '',
      sobrenome: doctorProfile.last_name || '', cpf: doctorCpf, crm, uf,
      email: doctorProfile.email, telefone: doctorProfile.phone || undefined,
      dataNascimento: formatBirthDate((doctor as unknown as { memed_birth_date?: string | null }).memed_birth_date) || undefined,
    },
    patientData: {
      idExterno: `autamedica-${patient.id}`, nome: patientName,
      sexo: sex, cpf: patientCpf, data_nascimento: birthDate,
      telefone: digits(patientProfile.phone), email: patientProfile.email,
    },
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const patientId = new URL(request.url).searchParams.get('patientId') || '';
    const context = await getContext(request, locals, patientId);
    if (context.response) return context.response;
    if (!context.doctorData || !context.patientData || !context.env) return internalError();
    const memed = new MemedService(context.env);
    const result = await memed.getOrCreateDoctorToken(context.doctorData);
    if (!result.token) return serviceUnavailable('memed_doctor_token_missing');
    return jsonOk({
      token: result.token, scriptUrl: memed.getScriptUrl(),
      patient: context.patientData,
    });
  } catch (error) {
    logger.error('[memed-token] failed to initialize Brazilian prescription', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return serviceUnavailable('memed_br_initialize_failed');
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null);
    const data = asObject(body);
    const patientId = typeof data?.patientId === 'string' ? data.patientId : '';
    const memedId = typeof data?.memedId === 'string' ? data.memedId : '';
    const event = data?.event;
    if (!VALID_MEMED_ID.test(memedId) || (event !== 'prescricaoImpressa' && event !== 'prescricaoExcluida')) {
      return badRequest('invalid_memed_event');
    }
    const context = await getContext(request, locals, patientId);
    if (context.response) return context.response;
    if (!context.doctorData || !context.doctor || !context.admin || !context.env) return internalError();

    const memed = new MemedService(context.env);
    const { token } = await memed.getOrCreateDoctorToken(context.doctorData);
    // New table is introduced by the migration in this PR; generic SupabaseClient
    // keeps this route buildable before generated DB declarations are refreshed.
    const memedDb = context.admin as unknown as SupabaseClient;
    if (!token) return serviceUnavailable('memed_doctor_token_missing');

    if (event === 'prescricaoExcluida') {
      // A deleted prescription may no longer be found in the Memed API.
      // Only mutate an already synchronized prescription belonging to this doctor/patient.
      const { data: existing, error: lookupError } = await memedDb
        .from('memed_prescriptions').select('id')
        .eq('memed_id', memedId).eq('doctor_id', context.doctor.id).eq('patient_id', patientId).maybeSingle();
      if (lookupError || !existing) return badRequest('memed_prescription_not_found');
      const { error } = await memedDb.from('memed_prescriptions')
        .update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', existing.id);
      if (error) return internalError('memed_delete_sync_failed');
      return jsonOk({ synchronized: true, status: 'deleted' });
    }

    // Do not trust a browser event as proof of issuance. Confirm it with Memed.
    const remote = asObject(await memed.getPrescription(token, memedId));
    const remoteData = asObject(remote?.data);
    if (!remoteData || String(remoteData.id) !== memedId) {
      return serviceUnavailable('memed_remote_verification_failed');
    }
    let digitalLink: unknown = null;
    try {
      digitalLink = await memed.getDigitalPrescriptionLink(token, memedId);
    } catch (error) {
      logger.warn('[memed-token] digital link not ready', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
    const { error } = await memedDb.from('memed_prescriptions').upsert({
      memed_id: memedId, doctor_id: context.doctor.id, patient_id: patientId,
      status: 'verified_at_provider', provider_data: remote, digital_link_data: digitalLink,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'memed_id' });
    if (error) {
      logger.error('[memed-token] prescription persistence failed', { code: error.code });
      return internalError('memed_prescription_persistence_failed');
    }
    // Provider issuance is verified, but we have NOT yet verified the PDF signature,
    // SNCR number, recipient delivery or unlock-code presentation.
    return jsonOk({ synchronized: true, memedId, status: 'verified_at_provider', delivered: false });
  } catch (error) {
    logger.error('[memed-token] event synchronization failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return serviceUnavailable('memed_event_sync_failed');
  }
};
