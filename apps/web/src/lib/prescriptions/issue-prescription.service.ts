/**
 * Service: Prescription issuance orchestrator.
 * Extracts all business logic from the issue route into a testable service.
 *
 * Flow: validate → generate artifacts → store PDF → update prescription
 *       → audit events → create dispensation order
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';
import { commitFarmalinkArtifact, recoverFarmalinkPrescription } from './farmalink.recovery.service';
import { registerFarmalinkIfEnabled, buildFarmalinkPrescriptionMapInput, canIssueWithPrescriberValidationStatus,
  type FarmalinkRegistration, type PrescriberValidationStatus } from './farmalink.issuance.service';
import { addDays, buildControlledSemaphoreReasons, mapDrugCategoryForDatabase, resolveInsurancePlan,
  sha256BytesHex, fail, resolveProfileName, type ClinicalData, type Result } from './prescription-issuance.shared';
export type { IssuanceResult, IssuanceError } from './prescription-issuance.shared';
import { generatePrescriptionPdf, type PrescriptionArtifacts, type PrescriptionPdfInput } from './pdf-prescription.service';
import { generateBrazilPrescriptionPdf } from './brazil/brazil-pdf-prescription.service';
import { rctaService } from './rcta.service';
import { getActiveCertificate, loadSigningCredentials } from '../doctors/services/certificate-query.service';
import { getSubstanceCategory, getValidityPeriodDays, requiresStrictPrescriptionValidation } from './strict-validation';

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

export async function issuePrescription(
  supabase: SupabaseClient,
  prescriptionId: string,
  userId: string,
): Promise<Result> {
  // 1. Resolve and validate doctor
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, license_number, license_type, uf_brazil, rqe_number, cpf, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address, signature_image_url, stamp_image_url, care_guide_template')
    .eq('user_id', userId)
    .maybeSingle();

  if (!doctor) return fail({ code: 'doctor_not_found' });
  if (!doctor.license_number) return fail({ code: 'missing_license_number' });
  if (!doctor.professional_address) return fail({ code: 'missing_professional_address' });

  // 2. Get and validate prescription
  const { data: rx } = await supabase
    .from('prescriptions')
    .select('id, doctor_id, patient_id, status, clinical_data, cuir, country_code, prescription_model_br')
    .eq('id', prescriptionId)
    .single();

  if (!rx) return fail({ code: 'prescription_not_found' });
  if (rx.doctor_id !== doctor.id) return fail({ code: 'not_your_prescription' });
  if (rx.cuir) return fail({ code: 'already_issued' });

  // Determine country jurisdiction from prescription or doctor profile
  const prescriptionCountry: string = (rx as { country_code?: string })?.country_code
    || (doctor.license_type === 'CRM' || doctor.uf_brazil ? 'BR' : doctor.license_type === 'MSP' ? 'UY' : 'AR');

  const { data: profile } = await supabase
    .from('profiles')
    .select('sss_validation_status')
    .eq('user_id', userId)
    .single();

  // Validate prescriber according to country regulations
  if (prescriptionCountry === 'AR') {
    if (!doctor.refeps_id) return fail({ code: 'missing_refeps_id' });
    if (!canIssueWithPrescriberValidationStatus(
      profile?.sss_validation_status as PrescriberValidationStatus | null | undefined,
    )) {
      return fail({ code: 'prescriber_validation_required' });
    }
  }

  // 3. Get and validate patient
  const { data: patient } = await supabase
    .from('patients')
    .select('user_id, dni, cuil, cpf, cns, address, birth_date, gender, insurance_info')
    .eq('id', rx.patient_id)
    .single();

  if (!patient) return fail({ code: 'patient_not_found' });
  // 4. Parse clinical data
  const clinicalData = rx.clinical_data as ClinicalData;
  const externalPatient = clinicalData?.external_patient;
  
  const hasPatientId = patient.dni
    || patient.cuil
    || (patient as { cpf?: string }).cpf
    || (patient as { ci?: string }).ci
    || externalPatient?.dni
    || externalPatient?.cuil
    || (externalPatient as { cpf?: string })?.cpf
    || (externalPatient as { ci?: string })?.ci;

  if (!hasPatientId) {
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

  const dispensationOrder = {
    prescription_id: prescriptionId,
    patient_id: rx.patient_id,
    doctor_id: rx.doctor_id,
    prescription_type: 'standard',
    medication: medicationName,
    formulation: item.presentation || item.dosage || 'No especificada',
    quantity_units: item.quantity ?? 1,
    duration_days: validityDays,
    dispense_window_start: now.split('T')[0],
    dispense_window_end: expiresAt.split('T')[0],
    clinical_semaphore: isControlledSubstance ? 'yellow' : 'green',
    semaphore_reasons: controlledSemaphoreReasons,
    requires_clarification: false,
    internal_notes: isControlledSubstance
      ? `Medicacion controlada (${substanceCategory}). Requiere validacion farmaceutica especifica.`
      : null,
  };

  const pdfInput: PrescriptionPdfInput = {
        prescriptionId,
        medication: {
          genericName: medicationName,
          commercialName: item.commercial_name,
          dosage: item.dosage ?? '',
          presentation: item.presentation ?? '',
          quantity: item.quantity ?? 1,
          instructions: item.instructions ?? '',
        },
        diagnosis: clinicalData.diagnosis ?? '',
        notes: clinicalData.notes,
        patient: {
          name: patientName,
          dni: patient.dni ?? externalPatient?.dni ?? (patient as { ci?: string }).ci ?? (externalPatient as { ci?: string })?.ci ?? undefined,
          cuil: patient.cuil ?? externalPatient?.cuil ?? undefined,
          dateOfBirth: patient.birth_date ?? externalPatient?.birth_date ?? undefined,
          sex: patient.gender ?? externalPatient?.gender ?? undefined,
          insurancePlan: resolveInsurancePlan(patient.insurance_info),
          address: patient.address ?? externalPatient?.address ?? undefined,
        },
        prescriber: {
          name: doctorName,
          license: doctor.license_number,
          licenseJurisdiction: doctor.enrollment_jurisdiction ?? (prescriptionCountry === 'UY' ? 'Uruguay' : undefined),
          licenseEntity: doctor.enrollment_entity ?? (prescriptionCountry === 'UY' ? 'MSP' : undefined),
          refeps: doctor.refeps_id ?? undefined,
          specialty: doctor.specialty ?? undefined,
          professionalAddress: doctor.professional_address ?? undefined,
          signatureImageUrl: doctor.signature_image_url ?? undefined,
          stampImageUrl: doctor.stamp_image_url ?? undefined,
        },
        issuedAt: now,
        expiresAt,
        careGuide: {
          tips: clinicalData.care_guide_tips,
          forgotten: clinicalData.care_guide_forgotten,
          warnings: clinicalData.care_guide_warnings,
          lifestyle: clinicalData.care_guide_lifestyle,
        },
        template: doctor.care_guide_template ?? 'neutral',
      };
  // Internal CUIR generation is deterministic by prescription ID and makes no network call.
  // Retain it before Farmalink so PDF recovery cannot create another internal identifier.
  if (prescriptionCountry === 'AR') {
    const internal = await rctaService.registerPrescription(doctor.license_number, patient.dni || 'unknown', medicationName, {
      jurisdiction: doctor.enrollment_jurisdiction ?? undefined, groupId: prescriptionId, expendioType: '02',
    });
    pdfInput.existingCuir = internal.cuir;
  }

  let externalRegistration: FarmalinkRegistration | undefined;
  if (prescriptionCountry === 'AR') {
    const farmalinkRegistration = await registerFarmalinkIfEnabled({
      supabase,
      prescriptionId,
      actorUserId: userId,
      clinicalData,
      doctor,
      doctorName,
      item,
      patient,
      patientName,
      now,
      expiresAt,
      pdfInput,
      dispensationOrder: {...dispensationOrder,drug_category:databaseDrugCategory,is_controlled_substance:isControlledSubstance,
        controlled_substance_list:isControlledSubstance ? substanceCategory : null},
    });
    if (farmalinkRegistration.ok === false) return fail(farmalinkRegistration.error);
    externalRegistration = farmalinkRegistration.registration;
  }

  const vendorName = externalRegistration?.vendorName ?? 'autamedica_internal';
  const vendorId = externalRegistration?.vendorId ?? `am-${Date.now()}`;

  // 6. Generate artifacts (PDF + QR + CUIR)
  let artifacts: PrescriptionArtifacts;
  try {
    if (prescriptionCountry === 'BR') {
      const generated = await rctaService.registerPrescription(
        userId,
        rx.patient_id,
        medicationName,
        { groupId: prescriptionId },
      );
      const verificationUrl = `https://autamedica.com/verify/${generated.cuir}`;
      const brPdf = generateBrazilPrescriptionPdf({
        prescriptionId,
        model: ((rx as { prescription_model_br?: string })?.prescription_model_br as 'simples') || 'simples',
        patient: {
          name: patientName,
          cpf: (patient as { cpf?: string }).cpf || (externalPatient as { cpf?: string })?.cpf || patient.dni || externalPatient?.dni || '',
          cns: (patient as { cns?: string }).cns,
          birthDate: patient.birth_date || externalPatient?.birth_date,
          address: patient.address || externalPatient?.address,
        },
        prescriber: {
          name: doctorName,
          crm: doctor.license_number,
          uf: doctor.uf_brazil || 'RS',
          rqe: (doctor as { rqe_number?: string }).rqe_number || undefined,
          cpf: (doctor as { cpf?: string }).cpf || '',
          specialty: doctor.specialty || undefined,
          address: doctor.professional_address || undefined,
          signatureImageUrl: doctor.signature_image_url || undefined,
        },
        medications: [
          {
            genericName: medicationName,
            commercialName: item.commercial_name,
            dosage: item.dosage || '',
            presentation: item.presentation || '',
            quantity: item.quantity || 1,
            instructions: item.instructions || '',
          },
        ],
        diagnosis: clinicalData.diagnosis || '',
        notes: clinicalData.notes,
        issuedAt: now,
        expiresAt,
        itiValidationUrl: verificationUrl,
      });

      artifacts = {
        cuir: generated.cuir,
        pdfBuffer: brPdf,
        pdfFilename: `Receita_Digital_${doctor.license_number}_${generated.cuir.slice(-6)}.pdf`,
        qrDataUrl: '',
        qrContent: verificationUrl,
      };
    } else {
      artifacts = await generatePrescriptionPdf({...pdfInput, externalPrescription: externalRegistration?.externalPrescription});
    }
  } catch (error) {
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger.error('[issuePrescription] PDF generation failed', {
      prescriptionId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    return fail({ code: 'pdf_generation_failed', details });
  }

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

  if (uploadError) {
    logger.error('[issuePrescription] PDF upload failed', uploadError);
    return fail({
      code: 'pdf_upload_failed',
      details: uploadError.message || String(uploadError),
    });
  }

  const { data: urlData, error: signedUrlError } = await supabase.storage
    .from('medical-documents')
    .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);
  const signedPdfUrl = urlData?.signedUrl ?? null;

  if (signedUrlError || !signedPdfUrl) {
    logger.error('[issuePrescription] Signed PDF URL creation failed', signedUrlError);
    return fail({
      code: 'pdf_upload_failed',
      details: signedUrlError?.message || 'signed_pdf_url_missing',
    });
  }

  if (externalRegistration) {
    const completed = await commitFarmalinkArtifact(supabase,{
      prescriptionId,attemptId:externalRegistration.attemptId,actorUserId:userId,path:pdfPath,
      hash:await sha256BytesHex(finalPdfBuffer),signatureMethod,signedUrl:signedPdfUrl,operation:'initial',
    });
    if (completed.ok === false) return fail({code:'update_failed',details:completed.error});
    return completed;
  }

  // 8. Update prescription record
  const { error: updateError } = await supabase
    .from('prescriptions')
    .update({
      cuir: artifacts.cuir,
      status: 'sent',
      vendor_name: vendorName,
      vendor_id: vendorId,
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
    return fail({ code: 'update_failed', details: updateError.message || String(updateError) });
  }

  // 9. Audit events (batched)
  const signatureHash = await sha256BytesHex(finalPdfBuffer);

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
  const { error: orderError } = await supabase.from('dispensation_orders').insert(dispensationOrder);

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
      vendorName,
      vendorId,
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
    .select('id, license_number, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address, signature_image_url, stamp_image_url, care_guide_template')
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
  let hasFarmalinkAttempt = rx.vendor_name === 'farmalink';
  if (!hasFarmalinkAttempt) {
    const attempt = await supabase.from('farmalink_issue_attempts').select('prescription_id')
      .eq('prescription_id',rx.id).maybeSingle();
    if (attempt.error) return fail({code:'farmalink_idempotency_unavailable'});
    hasFarmalinkAttempt = Boolean(attempt.data);
  }
  if (hasFarmalinkAttempt) {
    const recovered = await recoverFarmalinkPrescription(supabase,rx.id,userId);
    if (recovered.ok === false) return fail({code:'farmalink_pending_reconciliation'});
    return recovered;
  }
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
      quantity: item.quantity ?? 1,
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
    careGuide: {
      tips: clinicalData.care_guide_tips,
      forgotten: clinicalData.care_guide_forgotten,
      warnings: clinicalData.care_guide_warnings,
      lifestyle: clinicalData.care_guide_lifestyle,
    },
    template: doctor.care_guide_template ?? 'neutral',
  });

  // Never trust an old signed URL as a writable Storage path. Preserve the original object.
  const pdfPath = `prescriptions/${rx.cuir}/regenerated-${rx.id}-${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('medical-documents')
    .upload(pdfPath, artifacts.pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    logger.warn('[regenerateIssuedPrescriptionPdf] PDF upload failed', uploadError);
    return fail({ code: 'pdf_upload_failed', details: uploadError.message || String(uploadError) });
  }

  const { data: urlData, error: urlError } = await supabase.storage
    .from('medical-documents')
    .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);
  if (urlError || !urlData?.signedUrl) return fail({code:'pdf_upload_failed'});
  const signedPdfUrl = urlData.signedUrl;

  const { error: updateError } = await supabase
    .from('prescriptions')
    .update({
      qr_code_content: artifacts.qrContent,
      signed_pdf_url: signedPdfUrl,
    })
    .eq('id', rx.id);

  if (updateError) {
    logger.error('[regenerateIssuedPrescriptionPdf] Update failed', updateError);
    return fail({ code: 'update_failed', details: updateError.message || String(updateError) });
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
      vendorName: rx.vendor_name,
      vendorId: rx.vendor_id ?? '',
    },
  };
}

export const __testables = {
  registerFarmalinkIfEnabled,
  buildFarmalinkPrescriptionMapInput,
  canIssueWithPrescriberValidationStatus,
};


