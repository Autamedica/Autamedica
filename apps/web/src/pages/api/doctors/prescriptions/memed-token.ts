import type { APIRoute } from 'astro';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { MemedService } from '@/lib/prescriptions/brazil/memed.service';
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

async function handleMemedToken({ request, locals }: ApiContext, birthDateIso?: string): Promise<Response> {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const admin = createAstroAdminClient(locals?.runtime?.env);
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, cpf')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (doctorError) {
      logger.error('[memed-token] doctor lookup failed', doctorError);
      return internalError();
    }
    if (!doctor?.active || doctor.license_type !== 'CRM') {
      return forbidden('active_brazilian_doctor_required');
    }

    // A doctor active in the local directory is not enough: require an officially
    // verified and active CFM license matching the CRM and UF being sent to Memed.
    const { data: licenseRows, error: licenseError } = await admin
      .from('doctor_licenses')
      .select('license_number, uf_brazil')
      .eq('doctor_id', doctor.id)
      .eq('license_type', 'CRM')
      .eq('status', 'active')
      .eq('cfm_validation_status', 'valid')
      .limit(20);
    if (licenseError) {
      logger.error('[memed-token] verified license lookup failed', licenseError);
      return internalError();
    }
    const verifiedLicense = licenseRows?.some((item) =>
      crmDigits(item.license_number) === crmDigits(doctor.license_number)
      && item.uf_brazil?.toUpperCase() === doctor.uf_brazil?.toUpperCase()
    );
    if (!verifiedLicense) return forbidden('verified_brazilian_license_required');

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('first_name, last_name, email, phone, cpf')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (profileError) {
      logger.error('[memed-token] profile lookup failed', profileError);
      return internalError();
    }

    const nome = profile?.first_name?.trim() ?? '';
    const sobrenome = profile?.last_name?.trim() ?? '';
    const crm = crmDigits(doctor.license_number);
    const uf = (doctor.uf_brazil ?? '').toUpperCase();
    const cpf = cpfDigits(doctor.cpf || profile?.cpf);

    // Never register a medical professional using fabricated CPF, CRM or UF.
    if (!nome || !sobrenome || !crm || !VALID_UF.test(uf) || !/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
      return badRequest('memed_doctor_identity_incomplete');
    }

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
      ...(birthDateIso ? {
        dataNascimento: birthDateIso.split('-').reverse().join('/'),
      } : {}),
    });

    return jsonOk({
      token: tokenData.token,
      scriptUrl: memed.getScriptUrl(),
      doctor: { id: doctor.id, crm, uf, nome: `${nome} ${sobrenome}` },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'memed_doctor_birth_date_required') {
      return badRequest('memed_doctor_birth_date_required');
    }
    logger.error('[memed-token] token acquisition failed', err instanceof Error ? err.message : 'unknown');
    return internalError('memed_token_unavailable');
  }
}

export const GET: APIRoute = (context) => handleMemedToken(context);

export const POST: APIRoute = async (context) => {
  // DOB is supplied by the authenticated physician only for first-time Memed registration.
  // It is not stored in logs, query strings, client storage or AutaMedica tables.
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return badRequest('invalid_json');
  }
  const birthDate = body && typeof body === 'object' && 'birthDate' in body
    ? (body as { birthDate?: unknown }).birthDate : undefined;
  if (typeof birthDate !== 'string' || !isValidIsoDate(birthDate)) {
    return badRequest('memed_doctor_birth_date_invalid');
  }
  return handleMemedToken(context, birthDate);
};
