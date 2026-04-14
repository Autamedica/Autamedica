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
  | { code: 'update_failed' };

type Result = { ok: true; data: IssuanceResult } | { ok: false; error: IssuanceError };

function fail(error: IssuanceError): Result { return { ok: false, error }; }

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
    .select('id, license_number, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address')
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
    .select('user_id, dni, cuil, address, birth_date, gender')
    .eq('id', rx.patient_id)
    .single();

  if (!patient) return fail({ code: 'patient_not_found' });
  if (!patient.dni && !patient.cuil) return fail({ code: 'missing_patient_identification' });
  if (!patient.address) return fail({ code: 'missing_patient_address' });

  // 4. Resolve names
  const patientName = patient.user_id
    ? await resolveProfileName(supabase, patient.user_id, '')
    : 'Paciente';
  const doctorName = await resolveProfileName(supabase, userId, 'Dr.');

  // 5. Parse clinical data
  const clinicalData = rx.clinical_data as ClinicalData;
  const item = clinicalData?.items?.[0];
  if (!item?.generic_name) return fail({ code: 'no_medication' });

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // 6. Generate artifacts (PDF + QR + CUIR)
  const artifacts = await generatePrescriptionPdf({
    prescriptionId,
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
      dni: patient.dni ?? undefined,
      cuil: patient.cuil ?? undefined,
      dateOfBirth: patient.birth_date ?? undefined,
      sex: patient.gender ?? undefined,
      address: patient.address ?? undefined,
    },
    prescriber: {
      name: doctorName,
      license: doctor.license_number,
      licenseJurisdiction: doctor.enrollment_jurisdiction ?? undefined,
      licenseEntity: doctor.enrollment_entity ?? undefined,
      refeps: doctor.refeps_id ?? undefined,
      specialty: doctor.specialty ?? undefined,
      professionalAddress: doctor.professional_address ?? undefined,
    },
    issuedAt: now,
    expiresAt,
  });

  // 7. Store PDF
  const pdfPath = `prescriptions/${artifacts.cuir}/${artifacts.pdfFilename}`;
  const { error: uploadError } = await supabase.storage
    .from('medical-documents')
    .upload(pdfPath, artifacts.pdfBuffer, {
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
    })
    .eq('id', prescriptionId);

  if (updateError) {
    logger.error('[issuePrescription] Update failed', updateError);
    return fail({ code: 'update_failed' });
  }

  // 9. Audit events (batched)
  const { createHash } = await import('crypto');
  const signatureHash = createHash('sha256').update(artifacts.pdfBuffer).digest('hex');

  await supabase.from('prescription_audit_events').insert([
    {
      prescription_id: prescriptionId,
      event_type: 'ACT_DIGITAL_SIGNATURE',
      user_id: userId,
      signature_hash: signatureHash,
      metadata: { method: 'PAdES_SIMULATED', document_hash: signatureHash, version: '1.0' },
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
      },
    },
    {
      prescription_id: prescriptionId,
      event_type: 'issued',
      user_id: userId,
      metadata: { cuir: artifacts.cuir, pdfPath, signature_hash: signatureHash },
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
    medication: item.generic_name,
    formulation: item.presentation ?? item.dosage ?? '',
    quantity_units: item.quantity ?? 1,
    duration_days: 30,
    dispense_window_start: todayDate,
    dispense_window_end: expiryDate,
    clinical_semaphore: 'green',
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
