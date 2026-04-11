/**
 * POST /api/doctors/prescriptions/:id/issue
 * Issues a prescription: generates CUIR, PDF, QR and updates the record.
 * Returns the generated artifacts.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';
import { generatePrescriptionPdf } from '@/lib/prescriptions/pdf-prescription.service';

export const POST: APIRoute = async ({ request, params }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest('missing_prescription_id');

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user, supabase } = auth;

    // Resolve doctor with regulatory metadata
    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, license_number, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address')
      .eq('user_id', user.id)
      .single();

    if (!doctor) return forbidden('doctor_not_found');

    // ─── REGULATORY VALIDATION (DOCTOR) ───
    if (!doctor.license_number) return badRequest('bureaucratic_error: missing_license_number');
    if (!doctor.refeps_id) return badRequest('bureaucratic_error: missing_refeps_id');
    if (!doctor.professional_address) return badRequest('bureaucratic_error: missing_professional_address');

    // Get prescription
    const { data: rx } = await supabase
      .from('prescriptions')
      .select('id, doctor_id, patient_id, status, clinical_data, cuir')
      .eq('id', prescriptionId)
      .single();

    if (!rx) return badRequest('prescription_not_found');
    if (rx.doctor_id !== doctor.id) return forbidden('not_your_prescription');
    if (rx.cuir) return badRequest('already_issued');

    // Get patient profile with regulatory metadata
    const { data: patient } = await supabase
      .from('patients')
      .select('user_id, dni, cuil, address, birth_date, gender')
      .eq('id', rx.patient_id)
      .single();

    if (!patient) return badRequest('patient_not_found');

    // ─── REGULATORY VALIDATION (PATIENT) ───
    if (!patient.dni && !patient.cuil) return badRequest('bureaucratic_error: missing_patient_identification');
    if (!patient.address) return badRequest('bureaucratic_error: missing_patient_address');

    let patientName = 'Paciente';
    if (patient?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', patient.user_id)
        .single();
      if (profile) {
        patientName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
      }
    }

    // Get doctor profile
    const { data: doctorProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .single();
    const doctorName = doctorProfile
      ? `Dr. ${doctorProfile.first_name ?? ''} ${doctorProfile.last_name ?? ''}`.trim()
      : 'Médico';

    // Parse clinical data
    const clinicalData = rx.clinical_data as {
      items?: Array<{
        generic_name?: string;
        commercial_name?: string;
        dosage?: string;
        presentation?: string;
        quantity?: number;
        instructions?: string;
      }>;
      diagnosis?: string;
      notes?: string;
    };

    const item = clinicalData?.items?.[0];
    if (!item?.generic_name) return badRequest('prescription_has_no_medication');

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Generate PDF + QR + CUIR
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

    // Store PDF in Supabase Storage
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
        .createSignedUrl(pdfPath, 365 * 24 * 60 * 60); // 1 year
      signedPdfUrl = urlData?.signedUrl ?? null;
    } else {
      logger.warn('[issue] PDF upload failed, continuing without storage', uploadError);
    }

    // Update prescription with artifacts
    const { error: updateError } = await supabase
      .from('prescriptions')
      .update({
        cuir: artifacts.cuir,
        status: 'sent',
        vendor_name: 'autamedica_internal',
        vendor_id: `am-${Date.now()}`,
        qr_code_content: artifacts.qrContent,
        signed_pdf_url: signedPdfUrl ?? artifacts.qrContent,
      })
      .eq('id', prescriptionId);

    if (updateError) {
      logger.error('[issue] Update failed', updateError);
      return internalError();
    }

    // ─── BUREAUCRATIC ACT: DIGITAL SIGNATURE ───
    // Generate evidence hash for the issued document (SHA-256)
    const { createHash } = await import('crypto');
    const signatureHash = createHash('sha256').update(artifacts.pdfBuffer).digest('hex');

    await supabase.from('prescription_audit_events').insert({
      prescription_id: prescriptionId,
      event_type: 'ACT_DIGITAL_SIGNATURE',
      user_id: user.id,
      signature_hash: signatureHash,
      metadata: {
        method: 'PAdES_SIMULATED',
        document_hash: signatureHash,
        version: '1.0'
      },
    });

    // ─── BUREAUCRATIC ACT: RCTA REGISTRATION ───
    await supabase.from('prescription_audit_events').insert({
      prescription_id: prescriptionId,
      event_type: 'ACT_RCTA_REGISTRATION',
      user_id: user.id,
      metadata: {
        cuir: artifacts.cuir,
        registration_id: `AR-RCTA-${artifacts.cuir}`,
        jurisdiction: doctor.enrollment_jurisdiction || 'CENTRAL',
        status: 'COMPLIANT'
      },
    });

    // Final issuance log
    await supabase.from('prescription_audit_events').insert({
      prescription_id: prescriptionId,
      event_type: 'issued',
      user_id: user.id,
      metadata: {
        cuir: artifacts.cuir,
        pdfPath,
        signature_hash: signatureHash,
      },
    });

    // Create dispensation order so pharmacists can see and process it
    const todayDate = now.split('T')[0]; // YYYY-MM-DD
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
      logger.warn('[issue] Dispensation order creation failed', orderError);
    }

    logger.info('[issue] Prescription issued', { prescriptionId, cuir: artifacts.cuir });

    return jsonOk({
      cuir: artifacts.cuir,
      qrContent: artifacts.qrContent,
      signedPdfUrl,
      issuedAt: now,
      expiresAt,
    });
  } catch (err) {
    logger.error('[issue] POST error', err);
    return internalError();
  }
};
