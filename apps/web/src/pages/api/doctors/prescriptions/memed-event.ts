/**
 * Persist Memed issue/deletion events only after server-side provider verification.
 * Never claim the browser callback or an unsigned PDF proves pharmaceutical validity.
 */
import type { APIRoute } from 'astro';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { doctorHasPatientAccess } from '@/lib/doctors/lib/resolve-room';
import { MemedService } from '@/lib/prescriptions/brazil/memed.service';
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

  let input: JSONObject;
  try {
    input = asObject(await request.json());
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
    if (!doctor?.active || doctor.license_type !== 'CRM') return forbidden('brazil_prescriber_required');
    if (!await doctorHasPatientAccess(admin, doctor.id, patientId)) {
      return forbidden('doctor_patient_access_required');
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('first_name, last_name, cpf, email, phone')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    const cpf = (doctor.cpf || profile?.cpf || '').replace(/\D/g, '');
    const crm = (doctor.license_number || '').replace(/\D/g, '');
    const uf = doctor.uf_brazil || '';
    if (!/^\d{11}$/.test(cpf) || !crm || !/^[A-Z]{2}$/.test(uf)
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
      .select('id')
      .eq('doctor_id', doctor.id)
      .eq('patient_id', patientId)
      .eq('country_code', 'BR')
      .eq('vendor_name', 'memed')
      .eq('vendor_id', prescriptionId)
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

    const patient = asObject(rx.paciente);
    const externalId = patient.external_id ?? patient.externalId;
    // An exact patient linkage is mandatory to avoid cross-patient disclosure.
    if (externalId !== `autamedica-${patientId}`) {
      return forbidden('memed_patient_mismatch');
    }

    const rawItems = Array.isArray(rx.medicamentos) ? rx.medicamentos : [];
    const items = rawItems.slice(0, 20).map((item) => {
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
      vendor_id: prescriptionId,
      clinical_data: { source: 'memed', memed_prescription_id: prescriptionId, items, signature_verified: false, delivery_verified: false },
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      const { error } = await admin.from('prescriptions').update(payload).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('prescriptions').insert(payload);
      if (error) throw error;
    }
    return jsonOk({ status: 'recorded_pending_signature_and_delivery', prescriptionId });
  } catch (error) {
    logger.error('[memed-event] verification/persistence failed', error instanceof Error ? error.message : 'unknown');
    return internalError('memed_event_verification_failed');
  }
};
