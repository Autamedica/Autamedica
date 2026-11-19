/**
 * Persist Memed issue/deletion events only after server-side provider verification.
 * Never claim the browser callback or an unsigned PDF proves pharmaceutical validity.
 */
import type { APIRoute } from 'astro';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { assertMemedDispatchEncounter, resolveMemedPatient, validCpf } from '@/lib/prescriptions/brazil/memed-patient';
import { isMemedEnabled, isMemedPilotDoctor } from '@/lib/prescriptions/brazil/memed-pilot';
import { MemedService } from '@/lib/prescriptions/brazil/memed.service';
import { getMemedDoctorCpf } from '@/lib/prescriptions/brazil/memed-identity.repository';
import { logger } from '@autamedica/shared';
import type { Json } from '@autamedica/types';

type JSONObject = Record<string, unknown>;
type MemedDbError = { code?: string; message?: string } | null;
type MemedSelectRow = { id: string; doctor_id: string; patient_id: string; status?: string; digital_link_data?: unknown };
type MemedSelectQuery<T> = {
  eq(column: string, value: string): MemedSelectQuery<T>;
  maybeSingle(): Promise<{ data: T | null; error: MemedDbError }>;
};
type MemedMutationResult = { error: MemedDbError };
type MemedMutationQuery = PromiseLike<MemedMutationResult> & {
  eq(column: string, value: string): MemedMutationQuery;
};
type MemedAdminClient = {
  from(table: 'memed_prescriptions'): {
    select(columns: string): MemedSelectQuery<MemedSelectRow>;
    update(values: Record<string, unknown>): MemedMutationQuery;
    insert(values: Record<string, unknown>): Promise<MemedMutationResult>;
  };
};
const asObject = (value: unknown): JSONObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JSONObject : {};

function providerPrescription(response: JSONObject): JSONObject {
  const data = asObject(response.data);
  const attributes = asObject(data.attributes);
  return asObject(attributes.prescricao ?? data.prescricao ?? attributes);
}

function findProviderValue(value: unknown, keyPattern: RegExp, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProviderValue(entry, keyPattern, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as JSONObject)) {
    if (keyPattern.test(key) && typeof child === 'string' && child.trim()) return child.trim();
    const nested = findProviderValue(child, keyPattern, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function safeMemedDocumentUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'memed.com.br' && !hostname.endsWith('.memed.com.br')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeMemedDocumentReferences(value: unknown): Array<Record<string, Json>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((entry) => {
    const document = asObject(entry);
    return {
      ...(typeof document.id === 'string' || typeof document.id === 'number' ? { id: String(document.id) } : {}),
      ...(typeof document.uuid === 'string' ? { uuid: document.uuid } : {}),
      ...(typeof document.type === 'string' ? { type: document.type } : {}),
      ...(typeof document.status === 'string' ? { status: document.status } : {}),
      ...(typeof document.prescription_id === 'string' || typeof document.prescription_id === 'number'
        ? { prescription_id: String(document.prescription_id) } : {}),
      ...(typeof document.prescription_uuid === 'string' ? { prescription_uuid: document.prescription_uuid } : {}),
      ...(typeof document.file_name === 'string' ? { file_name: document.file_name.slice(0, 180) } : {}),
      ...(typeof document.signed === 'boolean' || typeof document.signed === 'number'
        ? { signed: document.signed } : {}),
    };
  }).filter((document) => Object.keys(document).length > 0);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  if (!isMemedEnabled(locals.runtime?.env as unknown as Record<string, unknown> | undefined)) {
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
  const requestId = input.requestId;
  const prescriptionId = input.prescriptionId;
  const action = input.action;
  if (
    typeof patientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(patientId) ||
    typeof prescriptionId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(prescriptionId) ||
    (requestId !== undefined && (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))) ||
    (action !== 'issued' && action !== 'deleted')
  ) {
    return badRequest('invalid_memed_event');
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const memedAdmin = admin as unknown as MemedAdminClient;
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, active, license_type, license_number, uf_brazil, cpf')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (doctorError) throw doctorError;
    if (!isMemedPilotDoctor(locals.runtime?.env as unknown as Record<string, unknown> | undefined, doctor?.id)) {
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

    if (typeof requestId === 'string') {
      await assertMemedDispatchEncounter(admin, doctor.id, patientId, requestId);
    }
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
      .select('id, status, clinical_data, physical_pdf_url')
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

    const { data: existingMemed, error: existingMemedError } = await memedAdmin
      .from('memed_prescriptions')
      .select('id,doctor_id,patient_id,status,digital_link_data')
      .eq('memed_id', prescriptionId)
      .maybeSingle();
    if (existingMemedError) throw existingMemedError;
    if (existingMemed && (existingMemed.doctor_id !== doctor.id || existingMemed.patient_id !== patientId)) {
      return forbidden('memed_prescription_ownership_conflict');
    }

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

    // Resolve the patient-facing Memed link and PDF resource server-side.
    // They remain provider references; neither is misrepresented as signed evidence.
    let digitalLinkUrl: string | null = null;
    let digitalUnlockCode: string | null = null;
    let fullDocumentUrl: string | null = null;
    const digitalLinkData: Record<string, unknown> = {};
    try {
      const linkResource = await memed.getDigitalPrescriptionLink(prescriptionId, authorizedDoctor.token);
      digitalLinkData.digital = linkResource;
      digitalLinkUrl = safeMemedDocumentUrl(findProviderValue(
        linkResource,
        /^(url|link|digital_url|digital_link|url_receita|link_receita|prescription_url|digital_prescription_url)$/i,
      ));
      digitalUnlockCode = findProviderValue(
        linkResource,
        /^(unlock.?code|access.?code|password|senha|codigo.?desbloqueio|codigo.?de.?desbloqueio|pin|code)$/i,
      );
    } catch {
      logger.warn('[memed-event] patient digital-link retrieval unavailable');
    }
    try {
      const documentResource = await memed.getFullPrescriptionDocumentUrl(prescriptionId, authorizedDoctor.token);
      digitalLinkData.pdf = documentResource;
      fullDocumentUrl = safeMemedDocumentUrl(findProviderValue(
        documentResource,
        /^(url|link|document_url|pdf_url|url_documento|url_pdf|file_url)$/i,
      ));
    } catch {
      logger.warn('[memed-event] full PDF resource retrieval unavailable');
    }

    const documentReferences = sanitizeMemedDocumentReferences(rx.documents);
    const providerVerifiedAt = new Date().toISOString();
    const clinicalData: Json = {
      source: 'memed',
      governance: {
        emission_mode: 'memed_provider_live',
        governance_source: 'cloudflare_pages_runtime_env',
        flags: {
          MEMED_RX_ENABLED: locals.runtime?.env?.MEMED_RX_ENABLED === 'true',
          MEMED_MOBILE_ENABLED: locals.runtime?.env?.MEMED_MOBILE_ENABLED === 'true',
          FARMALINK_ENABLED: locals.runtime?.env?.FARMALINK_ENABLED === 'true',
        },
        captured_at: providerVerifiedAt,
      },
      memed_prescription_id: prescriptionId,
      items,
      dispatch_request_id: typeof requestId === 'string' ? requestId : null,
      ...(digitalLinkUrl ? {
        memed_digital_prescription: {
          url: digitalLinkUrl,
          ...(digitalUnlockCode ? { unlock_code: digitalUnlockCode } : {}),
        },
      } : {}),
      ...(documentReferences.length ? { memed_documents: documentReferences } : {}),
      ...(fullDocumentUrl ? { memed_full_pdf_url: fullDocumentUrl } : {}),
      emission_status: 'provider_verified',
      provider_verified_at: providerVerifiedAt,
      signature_status: rx.signed === 1 || rx.signed === true ? 'provider_reported_signed' : 'pending',
      signature_verified: false,
      delivery_status: digitalLinkUrl ? 'provider_link_available' : 'pending',
      delivery_verified: false,
    };

    // Maintain the provider-specific read model as well as the canonical prescriptions row.
    // Links stay server-managed; signature and patient delivery remain unverified.
    const previousDigitalLinkData = asObject(existingMemed?.digital_link_data);
    const memedDocumentPayload = {
      doctor_id: doctor.id,
      patient_id: patientId,
      memed_id: prescriptionId,
      status: 'verified_at_provider',
      provider_data: {
        medication_name: String(items[0]?.commercial_name || items[0]?.generic_name || 'Receita digital Memed'),
        medications: items,
        provider_reported_signed: rx.signed === 1 || rx.signed === true,
        provider_verified_at: providerVerifiedAt,
        emission_mode: 'memed_provider_live',
        governance_source: 'cloudflare_pages_runtime_env',
        governance_flags: {
          MEMED_RX_ENABLED: locals.runtime?.env?.MEMED_RX_ENABLED === 'true',
          MEMED_MOBILE_ENABLED: locals.runtime?.env?.MEMED_MOBILE_ENABLED === 'true',
          FARMALINK_ENABLED: locals.runtime?.env?.FARMALINK_ENABLED === 'true',
        },
      },
      digital_link_data: {
        ...previousDigitalLinkData,
        ...digitalLinkData,
        ...(digitalLinkUrl ? { url: digitalLinkUrl, link: digitalLinkUrl } : {}),
        ...(fullDocumentUrl ? { pdf_url: fullDocumentUrl, document_url: fullDocumentUrl } : {}),
        ...(digitalUnlockCode ? { unlock_code: digitalUnlockCode } : {}),
      },
      pdf_signature_verified: false,
      patient_delivery_confirmed: false,
    };
    if (existingMemed) {
      const { error: updateMemedError } = await memedAdmin.from('memed_prescriptions')
        .update(memedDocumentPayload)
        .eq('id', existingMemed.id)
        .eq('doctor_id', doctor.id)
        .eq('patient_id', patientId);
      if (updateMemedError) throw updateMemedError;
    } else {
      const { error: insertMemedError } = await memedAdmin.from('memed_prescriptions').insert(memedDocumentPayload);
      if (insertMemedError?.code === '23505') {
        const { data: winner, error: winnerError } = await memedAdmin.from('memed_prescriptions')
          .select('id,doctor_id,patient_id')
          .eq('memed_id', prescriptionId)
          .maybeSingle();
        if (winnerError || winner?.doctor_id !== doctor.id || winner?.patient_id !== patientId) {
          return forbidden('memed_prescription_ownership_conflict');
        }
      } else if (insertMemedError) {
        throw insertMemedError;
      }
    }

    // Existing records may have been created by a callback retry before the
    // provider link was reachable. Enrich only that doctor's exact verified row.
    if (existing) {
      const previousClinicalData: Record<string, Json> =
        existing.clinical_data !== null && typeof existing.clinical_data === 'object' && !Array.isArray(existing.clinical_data)
          ? existing.clinical_data as Record<string, Json>
          : {};
      const hasPreviousDigitalLink = Boolean(previousClinicalData.memed_digital_prescription);
      const enrichedClinicalData: Json = {
        ...previousClinicalData,
        ...clinicalData,
        ...(!digitalLinkUrl && hasPreviousDigitalLink
          ? { memed_digital_prescription: previousClinicalData.memed_digital_prescription }
          : {}),
        delivery_status: digitalLinkUrl
          ? 'provider_link_available'
          : (typeof previousClinicalData.delivery_status === 'string'
            ? previousClinicalData.delivery_status
            : 'pending'),
      };
      const { error: updateError } = await admin.from('prescriptions')
        .update({
          clinical_data: enrichedClinicalData,
          ...((fullDocumentUrl || existing.physical_pdf_url)
            ? { physical_pdf_url: fullDocumentUrl ?? existing.physical_pdf_url }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('doctor_id', doctor.id)
        .eq('patient_id', patientId);
      if (updateError) throw updateError;
      return jsonOk({
        status: existing.status,
        prescriptionId,
        duplicate: true,
        documentAvailable: Boolean(
          digitalLinkUrl || fullDocumentUrl || documentReferences.length
          || hasPreviousDigitalLink || existing.physical_pdf_url
        ),
      });
    }

    // The external prescription is recorded without claiming its signature,
    // SNCR registration or patient delivery until independently verified.
    const payload = {
      doctor_id: doctor.id,
      patient_id: patientId,
      status: 'draft',
      country_code: 'BR',
      vendor_name: 'memed',
      vendor_id: String(rx.id ?? prescriptionId),
      physical_pdf_url: fullDocumentUrl,
      clinical_data: clinicalData,
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

