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

    // Resolve doctor
    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, license_number, specialty')
      .eq('user_id', user.id)
      .single();

    if (!doctor) return forbidden('doctor_not_found');

    // Get prescription
    const { data: rx } = await supabase
      .from('prescriptions')
      .select('id, doctor_id, patient_id, status, clinical_data, cuir')
      .eq('id', prescriptionId)
      .single();

    if (!rx) return badRequest('prescription_not_found');
    if (rx.doctor_id !== doctor.id) return forbidden('not_your_prescription');
    if (rx.cuir) return badRequest('already_issued');

    // Get patient profile
    const { data: patient } = await supabase
      .from('patients')
      .select('user_id, dni, birth_date, gender')
      .eq('id', rx.patient_id)
      .single();

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
        dni: patient?.dni ?? undefined,
        cuil: (clinicalData as Record<string, unknown>)?.patient_cuil as string | undefined,
        dateOfBirth: patient?.birth_date ?? undefined,
        sex: patient?.gender ?? undefined,
      },
      prescriber: {
        name: doctorName,
        license: doctor.license_number ?? 'PENDING',
        specialty: doctor.specialty,
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

    // Audit
    await supabase.from('prescription_audit_events').insert({
      prescription_id: prescriptionId,
      event_type: 'issued',
      user_id: user.id,
      metadata: {
        cuir: artifacts.cuir,
        vendor: 'autamedica_internal',
        pdfPath,
        qrContent: artifacts.qrContent,
      },
    });

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
