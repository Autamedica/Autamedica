/**
 * Persist Memed issue/deletion events only after server-side provider verification.
 * Never claim the browser callback or an unsigned PDF proves pharmaceutical validity.
 */
import type { APIRoute } from 'astro';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveMemedPatient, validCpf } from '@/lib/prescriptions/brazil/memed-patient';
import { MemedService } from '@/lib/prescriptions/brazil/memed.service';
import { getMemedDoctorCpf } from '@/lib/prescriptions/brazil/memed-identity.repository';
import { logger } from '@autamedica/shared';

type JSONObject = Record<string, unknown>;
const asObject = (value: unknown): JSONObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JSONObject : {};

function providerPrescription(response: JSONObject): JSONObject {
  const data = asObject(response.data);
  const attributes = asObject(data.attributes);
  return asObject(attributes.prescricao ?? data.prescricao ?? attributes);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  if (locals.runtime?.env?.MEMED_RX_ENABLED !== 'true') {
    return forbidden('memed_issuance_not_enabled');
  }

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return forbidden('cross_origin_request');

  let input: JSONObject;
  try {
    const text = await request.text();
    if (text.length > 4096) return badRequest('request_too_large');
    input = asObject(JSON.parse(text));
  } catch {
    return badRequest('invalid_json');
  }

  const patientId = input.patientId;
  const prescriptionId = input.prescriptionId;
  const action = input.action;
  if (
    typeof patientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(patientId) ||
    typeof prescriptionId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(prescriptionId) ||
    (action !== 'issued' && action !== 'deleted')
  ) {
    return badRequest('invalid_memed_event');
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, cpf')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (doctorError) throw doctorError;
    const pilotDoctorId = locals.runtime?.env?.MEMED_PILOT_DOCTOR_ID;
    if (typeof pilotDoctorId !== 'string' || pilotDoctorId !== doctor?.id) {
      return forbidden('memed_pilot_prescriber_only');
    }
    if (!doctor?.active || doctor.license_type !== 'CRM') return forbidden('brazil_prescriber_required');
    // Require a valid CFM verification matching this doctor's actual CRM and UF.
    const { data: activeLicenses, error: activeLicensesError } = await admin
      .from('doctor_licenses')
      .select('license_number, uf_brazil, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at, cfm_last_checked_at')
      .eq('doctor_id', doctor.id)
      .eq('license_type', 'CRM')
      .eq('status', 'active')
      .eq('cfm_validation_status', 'valid')
      .limit(20);
    if (activeLicensesError) throw activeLicensesError;
    const cfmVerified = activeLicenses?.some((lic) =>
      String(lic.license_number ?? '').replace(/\D/g, '') === String(doctor.license_number ?? '').replace(/\D/g, '')
      && lic.uf_brazil?.toUpperCase() === doctor.uf_brazil?.toUpperCase()
      && Boolean(lic.cfm_evidence_path?.trim())
      && (lic.cfm_review_notes?.trim().length ?? 0) >= 10
      && Boolean(lic.cfm_reviewed_by && lic.cfm_reviewed_at && lic.cfm_last_checked_at)
    );
    if (!cfmVerified) return forbidden('verified_brazilian_license_required');

    const authorizedPatient = await resolveMemedPatient(admin, doctor.id, patientId);

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('first_name, last_name, cpf, email, phone')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    const privateCpf = await getMemedDoctorCpf(admin, doctor.id);
    const cpf = (privateCpf || doctor.cpf || profile?.cpf || '').replace(/\D/g, '');
    const crm = (doctor.license_number || '').replace(/\D/g, '');
    const uf = doctor.uf_brazil || '';
    if (!validCpf(cpf) || !crm || !/^[A-Z]{2}$/.test(uf)
        || !profile?.first_name?.trim() || !profile?.last_name?.trim()) {
      return badRequest('memed_doctor_identity_incomplete');
    }

    const env: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(locals.runtime?.env ?? {})) {
      if (key.startsWith('MEMED_') && typeof value === 'string') env[key] = value;
    }
    const memed = new MemedService(env);
    const authorizedDoctor = await memed.getOrCreateDoctorToken({
      externalId: doctor.id,
      nome: profile.first_name,
      sobrenome: profile.last_name,
      cpf,
      crm,
      uf,
      email: profile.email || auth.user.email,
      telefone: profile.phone || undefined,
    });

    const { data: existing, error: existingError } = await admin.from('prescriptions')
      .select('id, status')
      .eq('doctor_id', doctor.id)
      .eq('patient_id', patientId)
      .eq('country_code', 'BR')
      .eq('vendor_name', 'memed')
      .or(`vendor_id.eq.${prescriptionId},clinical_data->>memed_prescription_id.eq.${prescriptionId}`)
      .maybeSingle();
    if (existingError) throw existingError;

    if (action === 'deleted') {
      if (!existing) return badRequest('memed_prescription_not_recorded');
      // Only update the local state when Memed no longer serves this prescription.
      try {
        await memed.getIssuedPrescription(prescriptionId, authorizedDoctor.token);
        return badRequest('memed_prescription_still_active');
      } catch (error) {
        if (!(error instanceof Error) || !error.message.endsWith(':404')) throw error;
      }
      const { error: cancelError } = await admin.from('prescriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (cancelError) throw cancelError;
      return jsonOk({ status: 'cancelled' });
    }

    const verified = await memed.getIssuedPrescription(prescriptionId, authorizedDoctor.token);
    const rx = providerPrescription(verified);
    // Memed event exposes prescriptionUuid; the provider API can also expose a resource id.
    const verifiedIdentifiers = [
      rx.prescriptionUuid,
      rx.id,
      asObject(verified.data).id,
      asObject(verified.data).prescriptionUuid,
    ].filter((value) => typeof value === 'string' || typeof value === 'number').map(String);
    if (!verifiedIdentifiers.includes(prescriptionId)) return forbidden('memed_prescription_id_mismatch');

    const prescriber = asObject(rx.medicos);
    if (String(prescriber.cpf ?? '').replace(/\D/g, '') !== cpf
        || String(prescriber.crm ?? '').replace(/\D/g, '') !== crm
        || prescriber.uf !== uf) return forbidden('memed_prescriber_mismatch');

    const patient = asObject(rx.paciente);
    const externalId = patient.external_id ?? patient.externalId;
    // An exact patient linkage is mandatory to avoid cross-patient disclosure.
    if (externalId !== authorizedPatient.idExterno
        || String(patient.cpf ?? '').replace(/\D/g, '') !== authorizedPatient.cpf) {
      return forbidden('memed_patient_mismatch');
    }

    if (existing) return jsonOk({ status: existing.status, prescriptionId, duplicate: true });

    const rawItems = Array.isArray(rx.medicamentos) ? rx.medicamentos : [];
    const items = rawItems.map((item) => {
      const med = asObject(item);
      return {
        generic_name: typeof med.descricao === 'string' ? med.descricao : '',
        commercial_name: typeof med.nome === 'string' ? med.nome : '',
        instructions: typeof med.sanitized_posology === 'string' ? med.sanitized_posology : '',
        quantity: typeof med.quantidade === 'number' ? med.quantidade : 1,
        receituario: typeof med.receituario === 'string' ? med.receituario : '',
      };
    });

    // The external prescription is recorded without claiming its signature,
    // SNCR registration or patient delivery until independently verified.
    const payload = {
      doctor_id: doctor.id,
      patient_id: patientId,
      status: 'draft',
      country_code: 'BR',
      vendor_name: 'memed',
      vendor_id: String(rx.id ?? prescriptionId),
      clinical_data: { source: 'memed', memed_prescription_id: prescriptionId, items,
        emission_status: 'provider_verified', provider_verified_at: new Date().toISOString(),
        signature_status: rx.signed === 1 || rx.signed === true ? 'provider_reported_signed' : 'pending',
        signature_verified: false, delivery_status: 'pending', delivery_verified: false },
      updated_at: new Date().toISOString(),
    };
    const { error: insertError } = await admin.from('prescriptions').insert(payload);
    if (insertError?.code === '23505') {
      // Concurrent callbacks can race; the unique provider index arbitrates.
      const { data: winner, error: winnerError } = await admin.from('prescriptions')
        .select('id, status, doctor_id, patient_id').eq('vendor_name', 'memed')
        .eq('vendor_id', payload.vendor_id).maybeSingle();
      if (winnerError || winner?.doctor_id !== doctor.id || winner.patient_id !== patientId) {
        return forbidden('memed_prescription_ownership_conflict');
      }
      return jsonOk({ status: winner.status, prescriptionId, duplicate: true });
    }
    if (insertError) throw insertError;
    return jsonOk({ status: 'recorded_pending_signature_and_delivery', prescriptionId });
  } catch (error) {
    if (error instanceof Error && ['doctor_patient_access_required',
      'memed_patient_country_required'].includes(error.message)) return forbidden(error.message);
    if (error instanceof Error && ['memed_patient_required', 'memed_patient_consent_required',
      'memed_patient_identity_incomplete'].includes(error.message)) return badRequest(error.message);
    logger.error('[memed-event] verification/persistence failed');
    return internalError('memed_event_verification_failed');
  }
};

