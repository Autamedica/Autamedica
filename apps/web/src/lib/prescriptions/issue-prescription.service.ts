/**
 * Service: Prescription issuance orchestrator.
 * Extracts all business logic from the issue route into a testable service.
 *
 * Flow: validate → generate artifacts → store PDF → update prescription
 *       → audit events → create dispensation order
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';
import { generatePrescriptionPdf } from './pdf-prescription.service';
// Certificate queries are Supabase-only (no node-forge dependency)
import { getActiveCertificate, loadSigningCredentials } from '../doctors/services/certificate-query.service';
import {
  getSubstanceCategory,
  getValidityPeriodDays,
  requiresStrictPrescriptionValidation,
} from './strict-validation';

interface ClinicalItem {
  generic_name?: string;
  commercial_name?: string;
  dosage?: string;
  presentation?: string;
  quantity?: number;
  instructions?: string;
}

interface ClinicalData {
  items?: ClinicalItem[];
  diagnosis?: string;
  notes?: string;
  external_patient?: {
    name?: string;
    dni?: string;
    cuil?: string;
    address?: string;
    birth_date?: string;
    gender?: string;
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildControlledSemaphoreReasons(
  medicationName: string,
  category: ReturnType<typeof getSubstanceCategory>,
  validityDays: number,
): string[] | null {
  if (category === 'standard') return null;

  return [
    `Medicacion controlada: ${category}`,
    `Validez operativa: ${validityDays} dias`,
    `Requiere validacion farmaceutica de sustancia controlada`,
    `No repetir sin nueva receta: ${medicationName}`,
  ];
}

function mapDrugCategoryForDatabase(
  category: ReturnType<typeof getSubstanceCategory>,
): 'default' | 'psychotropic' | 'narcotic' {
  if (category === 'estupefaciente') return 'narcotic';
  if (category === 'psicotropico' || category === 'stimulant') return 'psychotropic';
  return 'default';
}

function resolveInsurancePlan(insuranceInfo: unknown): string | undefined {
  if (!insuranceInfo || typeof insuranceInfo !== 'object' || Array.isArray(insuranceInfo)) {
    return undefined;
  }

  const data = insuranceInfo as Record<string, unknown>;
  const pickString = (keys: string[]): string | undefined => {
    const value = keys.map((key) => data[key]).find((entry) => typeof entry === 'string');
    return typeof value === 'string' ? value : undefined;
  };
  const provider = pickString(['provider', 'insurance_provider', 'obraSocial']);
  const plan = pickString(['plan', 'insurance_plan', 'planName']);

  return [provider, plan].filter(Boolean).join(' ').trim() || undefined;
}

export interface IssuanceResult {
  cuir: string;
  qrContent: string;
  signedPdfUrl: string | null;
  issuedAt: string;
  expiresAt: string;
}

export type IssuanceError =
  | { code: 'doctor_not_found' }
  | { code: 'missing_license_number' }
  | { code: 'missing_refeps_id' }
  | { code: 'missing_professional_address' }
  | { code: 'prescription_not_found' }
  | { code: 'not_your_prescription' }
  | { code: 'already_issued' }
  | { code: 'patient_not_found' }
  | { code: 'missing_patient_identification' }
  | { code: 'missing_patient_address' }
  | { code: 'no_medication' }
  | { code: 'missing_cuir' }
  | { code: 'pdf_upload_failed' }
  | { code: 'update_failed' };

type Result = { ok: true; data: IssuanceResult } | { ok: false; error: IssuanceError };

function fail(error: IssuanceError): Result { return { ok: false, error }; }

function getPrescriptionStoragePath(cuir: string, signedPdfUrl?: string | null): string {
  if (signedPdfUrl) {
    try {
      const url = new URL(signedPdfUrl);
      const marker = '/medical-documents/';
      const index = url.pathname.indexOf(marker);
      if (index >= 0) {
        return decodeURIComponent(url.pathname.slice(index + marker.length));
      }
    } catch {
      // Fall back to the canonical legacy path below.
    }
  }

  return `prescriptions/${cuir}/receta-${cuir}.pdf`;
}

function resolveExternalPrescriptionForPdf(
  vendorName?: string | null,
  vendorId?: string | null,
): Parameters<typeof generatePrescriptionPdf>[0]['externalPrescription'] {
  if (vendorName !== 'farmalink' || !vendorId) return undefined;

  return {
    provider: 'farmalink',
    number: vendorId,
    displayLabel: 'RECETA FARMALINK',
    legend: 'Número de receta para validación online en farmacia',
  };
}

async function resolveProfileName(
  supabase: SupabaseClient,
  userId: string,
  prefix: string,
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .single();
  if (!data) return prefix === 'Dr.' ? 'Médico' : 'Paciente';
  return `${prefix} ${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || prefix;
}

export async function issuePrescription(
  supabase: SupabaseClient,
  prescriptionId: string,
  userId: string,
): Promise<Result> {
  // 1. Resolve and validate doctor
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, license_number, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address, signature_image_url, stamp_image_url')
    .eq('user_id', userId)
    .single();

  if (!doctor) return fail({ code: 'doctor_not_found' });
  if (!doctor.license_number) return fail({ code: 'missing_license_number' });
  if (!doctor.refeps_id) return fail({ code: 'missing_refeps_id' });
  if (!doctor.professional_address) return fail({ code: 'missing_professional_address' });

  // 2. Get and validate prescription
  const { data: rx } = await supabase
    .from('prescriptions')
    .select('id, doctor_id, patient_id, status, clinical_data, cuir')
    .eq('id', prescriptionId)
    .single();

  if (!rx) return fail({ code: 'prescription_not_found' });
  if (rx.doctor_id !== doctor.id) return fail({ code: 'not_your_prescription' });
  if (rx.cuir) return fail({ code: 'already_issued' });

  // 3. Get and validate patient
  const { data: patient } = await supabase
    .from('patients')
    .select('user_id, dni, cuil, address, birth_date, gender, insurance_info')
    .eq('id', rx.patient_id)
    .single();

  if (!patient) return fail({ code: 'patient_not_found' });
  // 4. Parse clinical data
  const clinicalData = rx.clinical_data as ClinicalData;
  const externalPatient = clinicalData?.external_patient;
  if (!patient.dni && !patient.cuil && !externalPatient?.dni && !externalPatient?.cuil) {
    return fail({ code: 'missing_patient_identification' });
  }
  if (!patient.address && !externalPatient?.address) return fail({ code: 'missing_patient_address' });

  // 5. Resolve names
  const patientName = externalPatient?.name?.trim()
    || (patient.user_id ? await resolveProfileName(supabase, patient.user_id, '') : 'Paciente');
  const doctorName = await resolveProfileName(supabase, userId, 'Dr.');

  const item = clinicalData?.items?.[0];
  if (!item?.generic_name) return fail({ code: 'no_medication' });

  const medicationName = item.generic_name;
  const substanceCategory = getSubstanceCategory(medicationName);
  const databaseDrugCategory = mapDrugCategoryForDatabase(substanceCategory);
  const isControlledSubstance = requiresStrictPrescriptionValidation(medicationName);
  const validityDays = getValidityPeriodDays(medicationName);
  const issuedAtDate = new Date();
  const now = issuedAtDate.toISOString();
  const expiresAt = addDays(issuedAtDate, validityDays).toISOString();
  const controlledSemaphoreReasons = buildControlledSemaphoreReasons(
    medicationName,
    substanceCategory,
    validityDays,
  );

  // 6. Generate artifacts (PDF + QR + CUIR)
  const artifacts = await generatePrescriptionPdf({
    prescriptionId,
    medication: {
      genericName: medicationName,
      commercialName: item.commercial_name,
      dosage: item.dosage ?? '',
      presentation: item.presentation ?? '',
      quantity: item.quantity ?? 0,
      instructions: item.instructions ?? '',
    },
    diagnosis: clinicalData.diagnosis ?? '',
    notes: clinicalData.notes,
    patient: {
      name: patientName,
      dni: patient.dni ?? externalPatient?.dni ?? undefined,
      cuil: patient.cuil ?? externalPatient?.cuil ?? undefined,
      dateOfBirth: patient.birth_date ?? externalPatient?.birth_date ?? undefined,
      sex: patient.gender ?? externalPatient?.gender ?? undefined,
      insurancePlan: resolveInsurancePlan(patient.insurance_info),
      address: patient.address ?? externalPatient?.address ?? undefined,
    },
    prescriber: {
      name: doctorName,
      license: doctor.license_number,
      licenseJurisdiction: doctor.enrollment_jurisdiction ?? undefined,
      licenseEntity: doctor.enrollment_entity ?? undefined,
      refeps: doctor.refeps_id ?? undefined,
      specialty: doctor.specialty ?? undefined,
      professionalAddress: doctor.professional_address ?? undefined,
      signatureImageUrl: doctor.signature_image_url ?? undefined,
      stampImageUrl: doctor.stamp_image_url ?? undefined,
    },
    issuedAt: now,
    expiresAt,
  });

  // 6b. Attempt PAdES digital signing if doctor has a certificate
  let finalPdfBuffer = artifacts.pdfBuffer;
  let signatureMethod = 'electronic_simple';
  let certFingerprint: string | null = null;

  try {
    const activeCert = await getActiveCertificate(supabase, doctor.id);
    if (activeCert) {
      const { p12Buffer, password } = await loadSigningCredentials(
        supabase,
        doctor.id,
        activeCert.certFingerprint,
      );
      // Dynamic import: @signpdf depends on Node.js APIs not available in Cloudflare Workers
      const { signPdfWithP12 } = await import('./pdf-signer.service');
      const signResult = await signPdfWithP12({
        pdfBuffer: artifacts.pdfBuffer,
        p12Buffer,
        password,
        signerName: doctorName,
        reason: `Receta ${artifacts.cuir} - ${doctorName}`,
        location: doctor.enrollment_jurisdiction ?? 'Argentina',
      });
      finalPdfBuffer = signResult.signedPdfBuffer;
      signatureMethod = 'ac_external';
      certFingerprint = activeCert.certFingerprint;
      logger.info('[issuePrescription] PDF signed with PAdES', { cuir: artifacts.cuir });
    }
  } catch (signError) {
    logger.warn('[issuePrescription] PAdES signing failed, using electronic_simple', signError);
  }

  // 7. Store PDF (signed if PAdES succeeded, unsigned otherwise)
  const pdfPath = `prescriptions/${artifacts.cuir}/${artifacts.pdfFilename}`;
  const { error: uploadError } = await supabase.storage
    .from('medical-documents')
    .upload(pdfPath, finalPdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  let signedPdfUrl: string | null = null;
  if (!uploadError) {
    const { data: urlData } = await supabase.storage
      .from('medical-documents')
      .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);
    signedPdfUrl = urlData?.signedUrl ?? null;
  } else {
    logger.warn('[issuePrescription] PDF upload failed', uploadError);
  }

  // 8. Update prescription record
  const { error: updateError } = await supabase
    .from('prescriptions')
    .update({
      cuir: artifacts.cuir,
      status: 'sent',
      vendor_name: 'autamedica_internal',
      vendor_id: `am-${Date.now()}`,
      qr_code_content: artifacts.qrContent,
      signed_pdf_url: signedPdfUrl,
      signature_method: signatureMethod,
      drug_category: databaseDrugCategory,
      is_controlled_substance: isControlledSubstance,
      controlled_substance_list: isControlledSubstance ? substanceCategory : null,
    })
    .eq('id', prescriptionId);

  if (updateError) {
    logger.error('[issuePrescription] Update failed', updateError);
    return fail({ code: 'update_failed' });
  }

  // 9. Audit events (batched)
  const { createHash } = await import('crypto');
  const signatureHash = createHash('sha256').update(finalPdfBuffer).digest('hex');

  await supabase.from('prescription_audit_events').insert([
    {
      prescription_id: prescriptionId,
      event_type: 'ACT_DIGITAL_SIGNATURE',
      user_id: userId,
      signature_hash: signatureHash,
      metadata: {
        method: signatureMethod === 'ac_external' ? 'PAdES_SELF_SIGNED' : 'ELECTRONIC_SIMPLE',
        document_hash: signatureHash,
        cert_fingerprint: certFingerprint,
        version: '2.0',
      },
    },
    {
      prescription_id: prescriptionId,
      event_type: 'ACT_RCTA_REGISTRATION',
      user_id: userId,
      metadata: {
        cuir: artifacts.cuir,
        registration_id: `AR-RCTA-${artifacts.cuir}`,
        jurisdiction: doctor.enrollment_jurisdiction || 'CENTRAL',
        status: 'COMPLIANT',
        drug_category: substanceCategory,
        is_controlled_substance: isControlledSubstance,
        validity_days: validityDays,
      },
    },
    {
      prescription_id: prescriptionId,
      event_type: 'issued',
      user_id: userId,
      metadata: {
        cuir: artifacts.cuir,
        pdfPath,
        signature_hash: signatureHash,
        drug_category: substanceCategory,
        is_controlled_substance: isControlledSubstance,
        expires_at: expiresAt,
      },
    },
  ]);

  // 10. Create dispensation order
  const todayDate = now.split('T')[0];
  const expiryDate = expiresAt.split('T')[0];
  const { error: orderError } = await supabase.from('dispensation_orders').insert({
    prescription_id: prescriptionId,
    patient_id: rx.patient_id,
    doctor_id: rx.doctor_id,
    prescription_type: 'standard',
    medication: medicationName,
    formulation: item.presentation || item.dosage || 'No especificada',
    quantity_units: item.quantity ?? 1,
    duration_days: validityDays,
    dispense_window_start: todayDate,
    dispense_window_end: expiryDate,
    clinical_semaphore: isControlledSubstance ? 'yellow' : 'green',
    semaphore_reasons: controlledSemaphoreReasons,
    requires_clarification: false,
    internal_notes: isControlledSubstance
      ? `Medicacion controlada (${substanceCategory}). Requiere validacion farmaceutica especifica.`
      : null,
  });

  if (orderError) {
    logger.warn('[issuePrescription] Dispensation order creation failed', orderError);
  }

  logger.info('[issuePrescription] Complete', { prescriptionId, cuir: artifacts.cuir });

  return {
    ok: true,
    data: {
      cuir: artifacts.cuir,
      qrContent: artifacts.qrContent,
      signedPdfUrl,
      issuedAt: now,
      expiresAt,
    },
  };
}

export async function regenerateIssuedPrescriptionPdf(
  supabase: SupabaseClient,
  prescriptionRef: string,
  userId: string,
): Promise<Result> {
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, license_number, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address, signature_image_url, stamp_image_url')
    .eq('user_id', userId)
    .single();

  if (!doctor) return fail({ code: 'doctor_not_found' });
  if (!doctor.license_number) return fail({ code: 'missing_license_number' });
  if (!doctor.refeps_id) return fail({ code: 'missing_refeps_id' });
  if (!doctor.professional_address) return fail({ code: 'missing_professional_address' });

  const prescriptionQuery = supabase
    .from('prescriptions')
    .select('id, doctor_id, patient_id, status, clinical_data, cuir, signed_pdf_url, vendor_name, vendor_id')
    .limit(1);

  const { data: rows } = prescriptionRef.startsWith('AM-') || prescriptionRef.startsWith('AR-')
    ? await prescriptionQuery.eq('cuir', prescriptionRef)
    : await prescriptionQuery.eq('id', prescriptionRef);
  const rx = rows?.[0];

  if (!rx) return fail({ code: 'prescription_not_found' });
  if (rx.doctor_id !== doctor.id) return fail({ code: 'not_your_prescription' });
  if (!rx.cuir) return fail({ code: 'missing_cuir' });

  const { data: patient } = await supabase
    .from('patients')
    .select('user_id, dni, cuil, address, birth_date, gender, insurance_info')
    .eq('id', rx.patient_id)
    .single();

  if (!patient) return fail({ code: 'patient_not_found' });

  const clinicalData = rx.clinical_data as ClinicalData;
  const externalPatient = clinicalData?.external_patient;
  if (!patient.dni && !patient.cuil && !externalPatient?.dni && !externalPatient?.cuil) {
    return fail({ code: 'missing_patient_identification' });
  }
  if (!patient.address && !externalPatient?.address) return fail({ code: 'missing_patient_address' });

  const item = clinicalData?.items?.[0];
  if (!item?.generic_name) return fail({ code: 'no_medication' });

  const patientName = externalPatient?.name?.trim()
    || (patient.user_id ? await resolveProfileName(supabase, patient.user_id, '') : 'Paciente');
  const doctorName = await resolveProfileName(supabase, userId, 'Dr.');
  const now = new Date().toISOString();
  const validityDays = getValidityPeriodDays(item.generic_name);
  const expiresAt = addDays(new Date(now), validityDays).toISOString();

  const artifacts = await generatePrescriptionPdf({
    prescriptionId: rx.id,
    existingCuir: rx.cuir,
    externalPrescription: resolveExternalPrescriptionForPdf(rx.vendor_name, rx.vendor_id),
    medication: {
      genericName: item.generic_name,
      commercialName: item.commercial_name,
      dosage: item.dosage ?? '',
      presentation: item.presentation ?? '',
      quantity: item.quantity ?? 0,
      instructions: item.instructions ?? '',
    },
    diagnosis: clinicalData.diagnosis ?? '',
    notes: clinicalData.notes,
    patient: {
      name: patientName,
      dni: patient.dni ?? externalPatient?.dni ?? undefined,
      cuil: patient.cuil ?? externalPatient?.cuil ?? undefined,
      dateOfBirth: patient.birth_date ?? externalPatient?.birth_date ?? undefined,
      sex: patient.gender ?? externalPatient?.gender ?? undefined,
      insurancePlan: resolveInsurancePlan(patient.insurance_info),
      address: patient.address ?? externalPatient?.address ?? undefined,
    },
    prescriber: {
      name: doctorName,
      license: doctor.license_number,
      licenseJurisdiction: doctor.enrollment_jurisdiction ?? undefined,
      licenseEntity: doctor.enrollment_entity ?? undefined,
      refeps: doctor.refeps_id ?? undefined,
      specialty: doctor.specialty ?? undefined,
      professionalAddress: doctor.professional_address ?? undefined,
      signatureImageUrl: doctor.signature_image_url ?? undefined,
      stampImageUrl: doctor.stamp_image_url ?? undefined,
    },
    issuedAt: now,
    expiresAt,
  });

  const pdfPath = getPrescriptionStoragePath(rx.cuir, rx.signed_pdf_url);
  const { error: uploadError } = await supabase.storage
    .from('medical-documents')
    .upload(pdfPath, artifacts.pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    logger.warn('[regenerateIssuedPrescriptionPdf] PDF upload failed', uploadError);
    return fail({ code: 'pdf_upload_failed' });
  }

  const { data: urlData } = await supabase.storage
    .from('medical-documents')
    .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);
  const signedPdfUrl = urlData?.signedUrl ?? rx.signed_pdf_url ?? null;

  const { error: updateError } = await supabase
    .from('prescriptions')
    .update({
      qr_code_content: artifacts.qrContent,
      signed_pdf_url: signedPdfUrl,
    })
    .eq('id', rx.id);

  if (updateError) {
    logger.error('[regenerateIssuedPrescriptionPdf] Update failed', updateError);
    return fail({ code: 'update_failed' });
  }

  await supabase.from('prescription_audit_events').insert({
    prescription_id: rx.id,
    event_type: 'pdf_regenerated',
    user_id: userId,
    metadata: {
      cuir: artifacts.cuir,
      pdfPath,
      reason: 'refresh_prescription_artifact_template',
    },
  });

  return {
    ok: true,
    data: {
      cuir: artifacts.cuir,
      qrContent: artifacts.qrContent,
      signedPdfUrl,
      issuedAt: now,
      expiresAt,
    },
  };
}
