import type { APIRoute } from 'astro';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk, serviceUnavailable } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { validCpf } from '@/lib/prescriptions/brazil/memed-patient';

export const prerender = false;
const PILOT_ID = '080fb7ae-92b4-44d4-8941-a6db65004b9f';
const VALID_UF = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;

/** Admin Módulo 1: update the pilot's verified Memed identity, keeping CFM data aligned. */
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return badRequest('request_too_large');
    body = JSON.parse(raw);
  } catch {
    return badRequest('invalid_json');
  }
  const values = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const cpf = values.cpf;
  const crm = typeof values.crm === 'string' ? values.crm.replace(/\D/g, '') : '';
  const uf = typeof values.uf === 'string' ? values.uf.trim().toUpperCase() : '';
  if (typeof cpf !== 'string' || !validCpf(cpf)) return badRequest('memed_doctor_cpf_invalid');
  if (!/^\d{1,8}$/.test(crm) || !VALID_UF.test(uf)) return badRequest('memed_doctor_crm_or_uf_invalid');

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: doctor, error } = await admin.from('doctors')
      .select('id, active, care_country, license_type, license_number, uf_brazil')
      .eq('id', PILOT_ID).maybeSingle();
    if (error) return internalError('memed_pilot_lookup_failed');
    if (!doctor?.active || doctor.care_country !== 'BR' || doctor.license_type !== 'CRM') {
      return forbidden('active_brazilian_pilot_required');
    }
    const { data: license, error: licenseError } = await admin.from('doctor_licenses')
      .select('id, license_number, uf_brazil, status, cfm_validation_status, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at, cfm_last_checked_at')
      .eq('doctor_id', PILOT_ID).eq('license_type', 'CRM').eq('status', 'active')
      .eq('cfm_validation_status', 'valid').maybeSingle();
    if (licenseError) return internalError('memed_pilot_cfm_lookup_failed');
    if (!license?.cfm_evidence_path || !license.cfm_review_notes || !license.cfm_reviewed_by
        || !license.cfm_reviewed_at || !license.cfm_last_checked_at) {
      return forbidden('verified_cfm_evidence_required');
    }
    const expectedCrm = doctor.license_number.replace(/\D/g, '');
    const evidenceCrm = license.license_number.replace(/\D/g, '');
    const expectedUf = String(doctor.uf_brazil ?? '').toUpperCase();
    const evidenceUf = String(license.uf_brazil ?? '').toUpperCase();
    // Only normalize the existing CFM-verified registry. A genuinely different
    // CRM/UF must go through the documented CFM evidence review flow first.
    if (crm !== expectedCrm || crm !== evidenceCrm || uf !== expectedUf || uf !== evidenceUf) {
      return badRequest('memed_crm_must_match_verified_cfm_record');
    }

    const { error: privateError } = await (admin as any).from('memed_doctor_identities')
      .upsert({ doctor_id: PILOT_ID, cpf: cpf.replace(/\D/g, ''), crm, uf, verified_at: new Date().toISOString() },
        { onConflict: 'doctor_id' });
    if (privateError) return serviceUnavailable('memed_private_identity_persistence_failed');

    const { error: doctorUpdateError } = await admin.from('doctors')
      .update({ license_number: crm, uf_brazil: uf, updated_at: new Date().toISOString() })
      .eq('id', PILOT_ID).eq('license_number', doctor.license_number);
    if (doctorUpdateError) return serviceUnavailable('memed_doctor_registry_update_failed');

    const { error: licenseUpdateError } = await admin.from('doctor_licenses')
      .update({ license_number: crm, uf_brazil: uf, updated_at: new Date().toISOString() })
      .eq('id', license.id).eq('license_number', license.license_number);
    if (licenseUpdateError) {
      // Revert the public directory to the CFM-evidenced original if the second
      // write fails. The private record is harmless and can be retried.
      await admin.from('doctors').update({ license_number: doctor.license_number, uf_brazil: doctor.uf_brazil })
        .eq('id', PILOT_ID).eq('license_number', crm);
      return serviceUnavailable('memed_cfm_registry_update_failed');
    }
    const response = jsonOk({ saved: true, doctorId: PILOT_ID, crm, uf, destination: 'memed_private_identity_and_cfm_registry' });
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch {
    return internalError('memed_pilot_identity_persistence_failed');
  }
};
