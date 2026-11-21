import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { MemedService } from '@/lib/prescriptions/brazil/memed.service';
import {
  assertMemedDispatchEncounter,
  type MemedPatientDemographicsInput,
  resolveMemedPatient,
  validCpf,
  validPatientAddress,
  validPatientCity,
} from '@/lib/prescriptions/brazil/memed-patient';
import { isMemedEnabled, isMemedPilotDoctor } from '@/lib/prescriptions/brazil/memed-pilot';
import { getMemedDoctorCpf, storeMemedDoctorCpf } from '@/lib/prescriptions/brazil/memed-identity.repository';
import { logger } from '@autamedica/shared';

const cpfDigits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
const crmDigits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
const VALID_UF = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;

type ApiContext = Parameters<APIRoute>[0];

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && date.getUTCFullYear() >= 1900
    && date.getTime() < Date.now();
};

async function handleMemedToken({ request, locals }: ApiContext, birthDateIso?: string, providedCpf?: string, patientId?: unknown, patientDemographics?: MemedPatientDemographicsInput, requestId?: string): Promise<Response> {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  // Allow Memed initialization in ready/pending_issuance; provider signing and
  // patient delivery remain separate, explicit lifecycle validations.
  if (!isMemedEnabled(locals.runtime?.env as unknown as Record<string, unknown> | undefined)) {
    return forbidden('memed_issuance_not_enabled');
  }

  try {
    const admin = createAstroAdminClient(locals?.runtime?.env);
    const { data: clinicalScope, error: clinicalScopeError } = await (admin as unknown as SupabaseClient)
      .from('platform_operational_domains')
      .select('clinical_status')
      .eq('scope_key', 'BR')
      .maybeSingle();
    if (clinicalScopeError) return internalError('brazil_clinical_status_unavailable');
    const clinicalStatus = clinicalScope?.clinical_status?.toLowerCase();
    if (clinicalStatus === 'disabled' || clinicalStatus === 'suspended') {
      return forbidden('brazil_clinical_issuance_disabled');
    }

    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, cpf, memed_birth_date')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (doctorError) {
      logger.error('[memed-token] doctor lookup failed');
      return internalError();
    }
    // Pilot is restricted to an explicitly configured prescriber.
    if (!isMemedPilotDoctor(locals.runtime?.env as unknown as Record<string, unknown> | undefined, doctor?.id)) {
      return forbidden('memed_pilot_prescriber_only');
    }
    if (!doctor?.active || doctor.license_type !== 'CRM') {
      return forbidden('active_brazilian_doctor_required');
    }

    // A doctor active in the local directory is not enough: require an officially
    // verified and active CFM license matching the CRM and UF being sent to Memed.
    const { data: licenseRows, error: licenseError } = await admin
      .from('doctor_licenses')
      .select('license_number, uf_brazil, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at, cfm_last_checked_at')
      .eq('doctor_id', doctor.id)
      .eq('license_type', 'CRM')
      .eq('status', 'active')
      .eq('cfm_validation_status', 'valid')
      .limit(20);
    if (licenseError) {
      logger.error('[memed-token] verified license lookup failed');
      return internalError();
    }
    const verifiedLicense = licenseRows?.some((item) =>
      crmDigits(item.license_number) === crmDigits(doctor.license_number)
      && item.uf_brazil?.toUpperCase() === doctor.uf_brazil?.toUpperCase()
      && Boolean(item.cfm_evidence_path?.trim())
      && (item.cfm_review_notes?.trim().length ?? 0) >= 10
      && Boolean(item.cfm_reviewed_by && item.cfm_reviewed_at && item.cfm_last_checked_at)
    );
    if (!verifiedLicense) return forbidden('verified_brazilian_license_required');

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('first_name, last_name, email, phone, cpf')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (profileError) {
      logger.error('[memed-token] profile lookup failed');
      return internalError();
    }

    const nome = profile?.first_name?.trim() ?? '';
    const sobrenome = profile?.last_name?.trim() ?? '';
    const crm = crmDigits(doctor.license_number);
    const uf = (doctor.uf_brazil ?? '').toUpperCase();
    const storedCpf = await getMemedDoctorCpf(admin, doctor.id);
    // Ignore stale/invalid legacy CPF values and select the first checksum-valid
    // identity from private Memed storage, doctor directory, or profile.
    const existingCpf = [storedCpf, doctor.cpf, profile?.cpf]
      .map(cpfDigits).find(candidate => validCpf(candidate)) ?? '';
    if (existingCpf && providedCpf && existingCpf !== cpfDigits(providedCpf)) {
      return forbidden('memed_doctor_cpf_mismatch');
    }
    const cpf = existingCpf || cpfDigits(providedCpf);
    // Prefer the verified date already stored for this pilot. A browser-supplied
    // date may support legacy records, but must never override the persisted identity.
    const storedBirthDate = typeof doctor.memed_birth_date === 'string'
      && isValidIsoDate(doctor.memed_birth_date) ? doctor.memed_birth_date : undefined;
    if (storedBirthDate && birthDateIso && storedBirthDate !== birthDateIso) {
      return forbidden('memed_doctor_birth_date_mismatch');
    }
    const effectiveBirthDateIso = storedBirthDate ?? birthDateIso;

    // Never register a medical professional using fabricated CPF, CRM or UF.
    if (!nome || !sobrenome) return badRequest('memed_doctor_name_required');
    if (!crm || !VALID_UF.test(uf)) return badRequest('memed_doctor_license_incomplete');
    if (!validCpf(cpf)) return badRequest('memed_doctor_cpf_invalid');

    if (requestId) {
      if (typeof patientId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)) {
        return badRequest('memed_patient_required');
      }
      await assertMemedDispatchEncounter(admin, doctor.id, patientId, requestId);
    }
    const patient = await resolveMemedPatient(admin, doctor.id, patientId, patientDemographics);

    const envMap: Record<string, string | undefined> = {};
    if (locals.runtime?.env) {
      for (const [key, value] of Object.entries(locals.runtime.env)) {
        if (typeof value === 'string' && key.startsWith('MEMED_')) envMap[key] = value;
      }
    }
    const memed = new MemedService(envMap);
    const tokenData = await memed.getOrCreateDoctorToken({
      externalId: doctor.id,
      nome,
      sobrenome,
      cpf,
      crm,
      uf,
      email: profile?.email || auth.user.email,
      telefone: profile?.phone || undefined,
      ...(effectiveBirthDateIso ? {
        dataNascimento: effectiveBirthDateIso.split('-').reverse().join('/'),
      } : {}),
    });

    // Store the confirmed CPF only in the private backend table. No DOB is retained.
    if (!storedCpf) await storeMemedDoctorCpf(admin, doctor.id, cpf);

    const response = jsonOk({
      patient,
      patientDemographicsMissing: !patient.data_nascimento || !patient.sexo,
      patientAddressMissing: !patient.endereco,
      token: tokenData.token,
      scriptUrl: memed.getScriptUrl(),
      doctor: { id: doctor.id, userId: auth.user.id, crm, uf, nome: `${nome} ${sobrenome}` },
    });
    response.headers.set('Cache-Control', 'no-store, private');
    response.headers.set('Pragma', 'no-cache');
    return response;
  } catch (err) {
    if (err instanceof Error && err.message === 'memed_patient_country_required') return forbidden(err.message);
    if (err instanceof Error && err.message === 'memed_doctor_birth_date_required') {
      return badRequest('memed_doctor_birth_date_required');
    }
    if (err instanceof Error && err.message === 'doctor_patient_access_required') return forbidden(err.message);
    if (err instanceof Error && ['memed_patient_required', 'memed_patient_consent_required',
      'memed_patient_identity_incomplete', 'memed_patient_demographics_invalid'].includes(err.message)) return badRequest(err.message);
    if (err instanceof Error && err.message === 'memed_patient_demographics_update_failed') {
      return internalError(err.message);
    }
    logger.error('[memed-token] token acquisition failed');
    return internalError('memed_token_unavailable');
  }
}

export const GET: APIRoute = (context) => {
  const params = new URL(context.request.url).searchParams;
  return handleMemedToken(context, undefined, undefined, params.get('patientId'), undefined, params.get('requestId') ?? undefined);
};

export const POST: APIRoute = async (context) => {
  const auth = await withAuthRole(context.request, DOCTOR_ROLES, context.locals);
  if (!isAuthed(auth)) return auth;
  const origin = context.request.headers.get('origin');
  if (origin && origin !== new URL(context.request.url).origin) return forbidden('cross_origin_request');
  // DOB is supplied only when a legacy doctor record has no verified persisted Memed date.
  // It is not stored in logs, query strings, client storage or AutaMedica tables.
  let body: unknown;
  try {
    const text = await context.request.text();
    if (text.length > 4096) return badRequest('request_too_large');
    body = JSON.parse(text);
  } catch {
    return badRequest('invalid_json');
  }
  const providedCpf = body && typeof body === 'object' && 'cpf' in body
    ? (body as { cpf?: unknown }).cpf : undefined;
  if (providedCpf !== undefined && (typeof providedCpf !== 'string' || !validCpf(providedCpf))) {
    return badRequest('memed_doctor_cpf_invalid');
  }
  const birthDate = body && typeof body === 'object' && 'birthDate' in body
    ? (body as { birthDate?: unknown }).birthDate : undefined;
  if (birthDate !== undefined && (typeof birthDate !== 'string' || !isValidIsoDate(birthDate))) {
    return badRequest('memed_doctor_birth_date_invalid');
  }
  const patientBirthDate = body && typeof body === 'object' && 'patientBirthDate' in body
    ? (body as { patientBirthDate?: unknown }).patientBirthDate : undefined;
  const patientGender = body && typeof body === 'object' && 'patientGender' in body
    ? (body as { patientGender?: unknown }).patientGender : undefined;
  const patientAddress = body && typeof body === 'object' && 'patientAddress' in body
    ? (body as { patientAddress?: unknown }).patientAddress : undefined;
  const patientCity = body && typeof body === 'object' && 'patientCity' in body
    ? (body as { patientCity?: unknown }).patientCity : undefined;
  const requestId = body && typeof body === 'object' && 'requestId' in body
    ? (body as { requestId?: unknown }).requestId : undefined;
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))) {
    return badRequest('invalid_encounter');
  }
  if ((patientBirthDate !== undefined || patientGender !== undefined)
      && (typeof patientBirthDate !== 'string' || !isValidIsoDate(patientBirthDate)
        || (patientGender !== 'male' && patientGender !== 'female'))) {
    return badRequest('memed_patient_demographics_invalid');
  }
  if (patientCity !== undefined && patientAddress === undefined) {
    return badRequest('memed_patient_demographics_invalid');
  }
  if (patientAddress !== undefined && (typeof patientAddress !== 'string' || !validPatientAddress(patientAddress))) {
    return badRequest('memed_patient_demographics_invalid');
  }
  if (patientCity !== undefined && (typeof patientCity !== 'string' || !validPatientCity(patientCity))) {
    return badRequest('memed_patient_demographics_invalid');
  }
  const patientDemographics: MemedPatientDemographicsInput | undefined =
    (patientBirthDate && patientGender) || patientAddress
      ? {
          ...(patientBirthDate && patientGender
            ? { birthDate: patientBirthDate as string, gender: patientGender as 'male' | 'female' }
            : {}),
          ...(patientAddress
            ? {
                address: (patientAddress as string).trim(),
                ...(patientCity ? { city: (patientCity as string).trim() } : {}),
              }
            : {}),
        }
      : undefined;
  return handleMemedToken(context, birthDate as string | undefined, providedCpf as string | undefined,
    body && typeof body === 'object' && 'patientId' in body ? body.patientId : undefined, patientDemographics,
    requestId as string | undefined);
};


