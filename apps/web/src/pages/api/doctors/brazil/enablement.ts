import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import {
  buildBrazilEnablementSummary,
  parseDoctorEnablementPatch,
} from '@/lib/prescriptions/brazil/brazil-enablement';
import { validCpf } from '@/lib/prescriptions/brazil/cpf';

const digits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');

function privateJsonOk<T>(data: T): Response {
  const response = jsonOk(data);
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

async function loadDoctorEnablementSummary(
  admin: ReturnType<typeof createAstroAdminClient>,
  userId: string,
) {
  const { data: doctor, error: doctorError } = await admin
    .from('doctors')
    .select('id, active, care_country, license_type, license_number, uf_brazil, cpf, memed_birth_date, professional_address')
    .eq('user_id', userId)
    .maybeSingle();

  if (doctorError) throw doctorError;
  if (!doctor) return { kind: 'forbidden' as const, reason: 'doctor_profile_required' };
  if (doctor.care_country !== 'BR') {
    return { kind: 'forbidden' as const, reason: 'brazil_doctor_required' };
  }

  const [licensesRes, memedIdentityRes, credRes] = await Promise.all([
    admin
      .from('doctor_licenses')
      .select('license_number, uf_brazil, status, cfm_validation_status, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at, cfm_last_checked_at')
      .eq('doctor_id', doctor.id)
      .eq('license_type', 'CRM')
      .limit(20),
    admin
      .from('memed_doctor_identities')
      .select('cpf')
      .eq('doctor_id', doctor.id)
      .maybeSingle(),
    admin
      .from('doctor_brazil_credentials')
      .select('*')
      .eq('doctor_id', doctor.id)
      .maybeSingle(),
  ]);

  if (licensesRes.error) throw licensesRes.error;
  if (memedIdentityRes.error) throw memedIdentityRes.error;
  if (credRes.error) throw credRes.error;

  const cfmValidated =
    doctor.license_type === 'CRM' &&
    Boolean(
      licensesRes.data?.some(
        (lic) =>
          lic.status === 'active' &&
          lic.cfm_validation_status === 'valid' &&
          digits(lic.license_number) === digits(doctor.license_number) &&
          lic.uf_brazil?.toUpperCase() === doctor.uf_brazil?.toUpperCase() &&
          Boolean(lic.cfm_evidence_path?.trim()) &&
          (lic.cfm_review_notes?.trim().length ?? 0) >= 10 &&
          Boolean(lic.cfm_reviewed_by && lic.cfm_reviewed_at && lic.cfm_last_checked_at),
      ),
    );

  const effectiveCpf = digits(memedIdentityRes.data?.cpf || doctor.cpf);
  const hasCpf = validCpf(effectiveCpf);
  const hasBirthDate = Boolean(doctor.memed_birth_date);

  const summary = buildBrazilEnablementSummary({
    doctorId: doctor.id,
    doctorActive: Boolean(doctor.active),
    licenseNumber: doctor.license_number ?? null,
    ufBrazil: doctor.uf_brazil ?? null,
    cfmValidated,
    hasCpf,
    hasBirthDate,
    professionalAddress: doctor.professional_address ?? null,
    credentialRow: credRes.data,
  });

  return { kind: 'ok' as const, summary };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const result = await loadDoctorEnablementSummary(admin, auth.user.id);
    if (result.kind === 'forbidden') return forbidden(result.reason);
    return privateJsonOk(result.summary);
  } catch (err) {
    logger.error('[doctors/brazil/enablement/GET]', err);
    return internalError('brazil_enablement_unavailable');
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const rawBody = await request.json().catch(() => null);
  const parsed = parseDoctorEnablementPatch(rawBody);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, care_country')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (doctorError) throw doctorError;
    if (!doctor) return forbidden('doctor_profile_required');
    if (doctor.care_country !== 'BR') return forbidden('brazil_doctor_required');

    const input = parsed.value;
    if (input.professionalAddress !== undefined) {
      const { error: addrErr } = await admin
        .from('doctors')
        .update({ professional_address: input.professionalAddress })
        .eq('id', doctor.id);
      if (addrErr) throw addrErr;
    }

    const credUpdates: Record<string, unknown> = {};
    if (input.icpBrasilStatus !== undefined) credUpdates.icp_brasil_status = input.icpBrasilStatus;
    if (input.icpProvider !== undefined) credUpdates.icp_provider = input.icpProvider;
    if (input.icpExpiresAt !== undefined) credUpdates.icp_expires_at = input.icpExpiresAt;
    if (input.sncrB1Status !== undefined) credUpdates.sncr_b1_status = input.sncrB1Status;
    if (input.sncrVisaUf !== undefined) credUpdates.sncr_visa_uf = input.sncrVisaUf;
    if (input.sncrVisaMunicipality !== undefined) {
      credUpdates.sncr_visa_municipality = input.sncrVisaMunicipality;
    }

    if (Object.keys(credUpdates).length > 0) {
      // Use the user-scoped RLS client so PostgreSQL's anti-escalation trigger enforces authority.
      const { error: upsertErr } = await auth.supabase
        .from('doctor_brazil_credentials')
        .upsert({ doctor_id: doctor.id, ...credUpdates }, { onConflict: 'doctor_id' });
      if (upsertErr) throw upsertErr;
    }

    const refreshed = await loadDoctorEnablementSummary(admin, auth.user.id);
    if (refreshed.kind === 'forbidden') return forbidden(refreshed.reason);
    return privateJsonOk(refreshed.summary);
  } catch (err) {
    logger.error('[doctors/brazil/enablement/PATCH]', err);
    return internalError('brazil_enablement_update_failed');
  }
};
