import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers';
import {
  buildBrazilEnablementSummary,
  computeEffectiveBrazilCapabilities,
  parseAdminVerifyEnablement,
  type IcpBrasilStatus,
  type MemedLinkStatus,
  type SncrB1Status,
} from '@/lib/prescriptions/brazil/brazil-enablement';
import { validCpf } from '@/lib/prescriptions/brazil/cpf';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');

async function assertAdmin(
  request: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals: any,
  admin: ReturnType<typeof createAstroAdminClient>,
): Promise<{ ok: boolean; userId?: string }> {
  let userId = locals?.session?.user?.id as string | undefined;

  if (!userId) {
    const authHeader = request.headers.get('authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return { ok: false };

    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return { ok: false };
    userId = data.user.id;
  }

  const { data: profile, error } = await admin
    .from('profiles')
    .select('role, active')
    .eq('user_id', userId)
    .maybeSingle();

  if (
    error ||
    profile?.active !== true ||
    !profile?.role ||
    !['admin', 'platform_admin'].includes(profile.role)
  ) {
    return { ok: false };
  }

  return { ok: true, userId };
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, locals, admin);
  if (!auth.ok || !auth.userId) return unauthorized('admin role required');

  const doctorId = params.id?.trim() ?? '';
  if (!UUID_REGEX.test(doctorId)) return badRequest('invalid doctor id');

  const rawBody = await request.json().catch(() => null);
  const parsed = parseAdminVerifyEnablement(rawBody);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const { data: doctor, error: docErr } = await admin
      .from('doctors')
      .select('id, active, care_country, license_type, license_number, uf_brazil, cpf, memed_birth_date, professional_address')
      .eq('id', doctorId)
      .maybeSingle();

    if (docErr) throw docErr;
    if (!doctor) return notFound('doctor not found');
    if (doctor.care_country !== 'BR') {
      return badRequest('brazil enablement is only valid for BR doctors');
    }

    const [licensesRes, memedIdentityRes, existingCredRes] = await Promise.all([
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
    if (existingCredRes.error) throw existingCredRes.error;

    const existing = existingCredRes.data;
    const input = parsed.value;
    const nowIso = new Date().toISOString();

    const memedLinkStatus = (input.memedLinkStatus ?? existing?.memed_link_status ?? 'not_linked') as MemedLinkStatus;
    const icpBrasilStatus = (input.icpBrasilStatus ?? existing?.icp_brasil_status ?? 'not_started') as IcpBrasilStatus;
    const icpProvider = input.icpProvider !== undefined ? input.icpProvider : (existing?.icp_provider ?? null);
    const icpExpiresAt = input.icpExpiresAt !== undefined ? input.icpExpiresAt : (existing?.icp_expires_at ?? null);
    const sncrB1Status = (input.sncrB1Status ?? existing?.sncr_b1_status ?? 'not_requested') as SncrB1Status;
    const sncrVisaUf = input.sncrVisaUf !== undefined
      ? input.sncrVisaUf
      : (existing?.sncr_visa_uf ?? doctor.uf_brazil ?? null);
    const sncrVisaMunicipality = input.sncrVisaMunicipality !== undefined
      ? input.sncrVisaMunicipality
      : (existing?.sncr_visa_municipality ?? null);
    const sncrReviewNotes = input.sncrReviewNotes !== undefined
      ? input.sncrReviewNotes
      : (existing?.sncr_review_notes ?? null);

    if (sncrB1Status === 'verified' && !sncrVisaUf) {
      return badRequest('sncrVisaUf is required when verifying SNCR B1 quota');
    }

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

    const hasCpf = validCpf(digits(memedIdentityRes.data?.cpf || doctor.cpf));
    const hasProfessionalAddress = Boolean(doctor.professional_address && doctor.professional_address.trim().length >= 5);

    const capabilities = computeEffectiveBrazilCapabilities({
      doctorActive: Boolean(doctor.active),
      cfmValidated,
      hasCpf,
      hasProfessionalAddress,
      memedLinkStatus,
      icpBrasilStatus,
      icpExpiresAt,
      sncrB1Status,
      sncrVisaUf,
    });

    const payload = {
      doctor_id: doctor.id,
      memed_link_status: memedLinkStatus,
      memed_linked_at:
        memedLinkStatus !== 'not_linked' ? (existing?.memed_linked_at ?? nowIso) : null,
      memed_test_prescription_id:
        input.memedTestPrescriptionId !== undefined
          ? input.memedTestPrescriptionId
          : (existing?.memed_test_prescription_id ?? null),
      icp_brasil_status: icpBrasilStatus,
      icp_provider: icpProvider,
      icp_expires_at: icpExpiresAt,
      icp_verified_at:
        icpBrasilStatus === 'verified' ? (existing?.icp_verified_at ?? nowIso) : null,
      icp_verified_by:
        icpBrasilStatus === 'verified' ? (existing?.icp_verified_by ?? auth.userId) : null,
      sncr_b1_status: sncrB1Status,
      sncr_visa_uf: sncrVisaUf,
      sncr_visa_municipality: sncrVisaMunicipality,
      sncr_review_notes: sncrReviewNotes,
      sncr_quota_last_confirmed_at:
        sncrB1Status === 'verified' ? nowIso : (existing?.sncr_quota_last_confirmed_at ?? null),
      sncr_verified_at:
        sncrB1Status === 'verified' ? (existing?.sncr_verified_at ?? nowIso) : null,
      sncr_verified_by:
        sncrB1Status === 'verified' ? (existing?.sncr_verified_by ?? auth.userId) : null,
      can_issue_simple_rx: capabilities.canIssueSimpleRx,
      can_issue_rce_ret_rx: capabilities.canIssueRceRetRx,
      can_issue_controlled_b1: capabilities.canIssueControlledB1,
      last_reviewed_by: auth.userId,
      last_reviewed_at: nowIso,
    };

    const { data: saved, error: saveErr } = await admin
      .from('doctor_brazil_credentials')
      .upsert(payload, { onConflict: 'doctor_id' })
      .select('*')
      .single();

    if (saveErr) throw saveErr;

    const summary = buildBrazilEnablementSummary({
      doctorId: doctor.id,
      doctorActive: Boolean(doctor.active),
      licenseNumber: doctor.license_number ?? null,
      ufBrazil: doctor.uf_brazil ?? null,
      cfmValidated,
      hasCpf,
      hasBirthDate: Boolean(doctor.memed_birth_date),
      professionalAddress: doctor.professional_address ?? null,
      credentialRow: saved,
    });

    const res = jsonOk(summary);
    res.headers.set('Cache-Control', 'no-store, private');
    return res;
  } catch (err) {
    logger.error('[admin/doctors/brazil-enablement/verify]', err);
    return internalError('brazil_enablement_verify_failed');
  }
};
