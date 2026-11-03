import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/auth-helpers.ts';
import {
  generatePrescriptionPdfBytes,
  sha256Hex,
  type PrescriptionItem,
} from '../_shared/pdf-helpers.ts';

function generateCuir(): string {
  const timestampHex = Date.now().toString(16).toUpperCase();
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `AR-MD-${timestampHex}-${randomHex}`;
}

export async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      405,
      corsHeaders,
    );
  }

  try {
    const { user, serviceClient } = await requireAuth(req, corsHeaders);

    // 1. Verify user is a doctor in profiles
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('first_name, last_name, role, active, sss_validation_status, matricula_nacional')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile || profile.role !== 'doctor' || profile.active === false) {
      return jsonResponse(
        { error: 'User is not an authorized active doctor', code: 'FORBIDDEN_ROLE' },
        403,
        corsHeaders,
      );
    }

    // 2. Verify doctor record exists and is active
    const { data: doctor, error: doctorError } = await serviceClient
      .from('doctors')
      .select('id, user_id, active, care_country, license_type, license_number, license_jurisdiction, enrollment_jurisdiction, refeps_id, specialty')
      .eq('user_id', user.id)
      .maybeSingle();

    if (doctorError) {
      throw doctorError;
    }

    if (!doctor || !doctor.active) {
      return jsonResponse(
        { error: 'Active doctor record required', code: 'DOCTOR_INACTIVE' },
        403,
        corsHeaders,
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonResponse(
        { error: 'Invalid JSON payload', code: 'INVALID_JSON' },
        400,
        corsHeaders,
      );
    }

    // 3. Country-specific validation (AR defaults to strict REFEPS and SSS validation)
    const countryCode = body.countryCode;
    if (countryCode !== 'AR' || doctor.care_country !== 'AR' || !['MN', 'MP'].includes(doctor.license_type)) {
      return jsonResponse({ error: 'Use the authorized country-specific issuance route', code: 'COUNTRY_ISSUANCE_ROUTE_REQUIRED' }, 409, corsHeaders);
    }
    if (countryCode === 'AR') {
      if (!doctor.refeps_id || !doctor.refeps_id.trim()) {
        return jsonResponse(
          {
            error: 'Doctor REFEPS ID is required for Argentina electronic prescriptions (Res. 2214/2025)',
            code: 'REFEPS_REQUIRED',
          },
          422,
          corsHeaders,
        );
      }

      const sssStatus = profile.sss_validation_status;
      if (sssStatus !== 'valid' && sssStatus !== 'exempt') {
        return jsonResponse(
          {
            error: `Doctor SSS validation status must be 'valid' or 'exempt'. Current status: '${sssStatus || 'pending'}'`,
            code: 'SSS_VALIDATION_REQUIRED',
          },
          422,
          corsHeaders,
        );
      }
    }

    let prescriptionId = body.prescriptionId ? String(body.prescriptionId) : undefined;
    let patientId = body.patientId ? String(body.patientId) : undefined;
    let items: PrescriptionItem[] = Array.isArray(body.items) ? body.items : [];
    let diagnosis = typeof body.diagnosis === 'string' ? body.diagnosis.trim() : '';
    let notes = typeof body.notes === 'string' ? body.notes.trim() : '';

    // 4. Handle existing draft or create new prescription
    if (prescriptionId) {
      const { data: existingRx, error: rxError } = await serviceClient
        .from('prescriptions')
        .select('*')
        .eq('id', prescriptionId)
        .maybeSingle();

      if (rxError || !existingRx) {
        return jsonResponse(
          { error: 'Prescription draft not found', code: 'PRESCRIPTION_NOT_FOUND' },
          404,
          corsHeaders,
        );
      }

      if (existingRx.doctor_id !== doctor.id) {
        return jsonResponse(
          {
            error: 'Forbidden: Prescription does not belong to authenticated doctor',
            code: 'FORBIDDEN_PRESCRIPTION',
          },
          403,
          corsHeaders,
        );
      }

      if (existingRx.status !== 'draft' && existingRx.status !== 'signed') {
        return jsonResponse(
          {
            error: `Prescription in status '${existingRx.status}' cannot be re-issued`,
            code: 'INVALID_STATUS',
          },
          409,
          corsHeaders,
        );
      }

      if (existingRx.country_code !== countryCode || (patientId && patientId !== existingRx.patient_id)) {
        return jsonResponse({ error: 'Prescription jurisdiction or patient mismatch', code: 'COUNTRY_OR_PATIENT_MISMATCH' }, 409, corsHeaders);
      }
      patientId = existingRx.patient_id;

      const clinical = (existingRx.clinical_data || {}) as Record<string, unknown>;
      if (items.length === 0 && Array.isArray(clinical.items)) {
        items = clinical.items as PrescriptionItem[];
      }
      if (!diagnosis && typeof clinical.diagnosis === 'string') {
        diagnosis = clinical.diagnosis;
      }
      if (!notes && typeof clinical.notes === 'string') {
        notes = clinical.notes;
      }
    }

    if (!patientId) {
      return jsonResponse(
        { error: 'patientId is required', code: 'PATIENT_ID_REQUIRED' },
        400,
        corsHeaders,
      );
    }

    if (!items || items.length === 0) {
      return jsonResponse(
        { error: 'items array must contain at least one medication', code: 'ITEMS_REQUIRED' },
        400,
        corsHeaders,
      );
    }

    const { data: carePatient, error: careError } = await serviceClient.from('patients')
      .select('id, active, care_country').eq('id', patientId).maybeSingle();
    if (careError || !carePatient?.active || carePatient.care_country !== countryCode) {
      return jsonResponse({ error: 'Patient care country must match prescriber', code: 'CARE_COUNTRY_MISMATCH' }, 409, corsHeaders);
    }

    if (!prescriptionId) {
      const { data: insertedRx, error: insertError } = await serviceClient
        .from('prescriptions')
        .insert({
          doctor_id: doctor.id,
          country_code: countryCode,
          patient_id: patientId,
          status: 'draft',
          clinical_data: {
            items,
            diagnosis,
            notes,
            country_code: countryCode,
          },
          vendor_name: 'autamedica',
        })
        .select('id, created_at')
        .single();

      if (insertError || !insertedRx) {
        throw new Error(`Failed to insert prescription: ${insertError?.message || 'unknown error'}`);
      }

      prescriptionId = insertedRx.id;
    }

    // 5. Query patient details for PDF header
    const { data: patient } = await serviceClient
      .from('patients')
      .select('id, user_id, dni, cuil, address, insurance_info')
      .eq('id', patientId)
      .maybeSingle();

    let patientName = 'Paciente';
    let patientDni = patient?.dni;
    let patientCuil = patient?.cuil;
    let patientAddress = patient?.address;
    let insurancePlan: string | undefined;

    if (patient?.insurance_info && typeof patient.insurance_info === 'object') {
      const ins = patient.insurance_info as Record<string, unknown>;
      insurancePlan = (ins.provider || ins.plan || ins.name) as string | undefined;
    }

    if (patient?.user_id) {
      const { data: patProfile } = await serviceClient
        .from('profiles')
        .select('first_name, last_name, dni, cuil, address')
        .eq('user_id', patient.user_id)
        .maybeSingle();

      if (patProfile) {
        patientName = `${patProfile.first_name || ''} ${patProfile.last_name || ''}`.trim() || 'Paciente';
        patientDni = patientDni || patProfile.dni;
        patientCuil = patientCuil || patProfile.cuil;
        patientAddress = patientAddress || patProfile.address;
      }
    }

    // 6. Generate CUIR and QR content
    const cuir = generateCuir();
    const qrCodeContent = `https://autamedica.com/verify/${cuir}`;

    // 7. Render official PDF
    const now = new Date();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const doctorName = `Dr/Dra. ${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Médico';
    const doctorLicense = doctor.license_number || profile.matricula_nacional || 'S/N';
    const doctorJurisdiction = doctor.license_jurisdiction || doctor.enrollment_jurisdiction || 'Nacional';

    const pdfBytes = generatePrescriptionPdfBytes({
      cuir,
      issuedAt,
      expiresAt,
      doctor: {
        name: doctorName,
        licenseNumber: doctorLicense,
        licenseJurisdiction: doctorJurisdiction,
        refepsId: doctor.refeps_id,
        specialty: doctor.specialty,
      },
      patient: {
        name: patientName,
        dni: patientDni,
        cuil: patientCuil,
        insurancePlan,
        address: typeof patientAddress === 'string' ? patientAddress : undefined,
      },
      items,
      diagnosis,
      notes,
    });

    const signatureHash = await sha256Hex(pdfBytes);

    // 8. Upload to storage bucket medical-documents
    const pdfPath = `prescriptions/${cuir}/receta-${cuir}.pdf`;
    const { error: uploadError } = await serviceClient.storage
      .from('medical-documents')
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    // 9. Generate signed URL (1 year validity)
    const { data: urlData, error: urlError } = await serviceClient.storage
      .from('medical-documents')
      .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);

    if (urlError || !urlData?.signedUrl) {
      throw new Error(`Failed to generate signed URL: ${urlError?.message || 'missing url'}`);
    }
    const signedPdfUrl = urlData.signedUrl;

    // 10. Update prescription status to 'sent'
    const { data: updatedRx, error: updateError } = await serviceClient
      .from('prescriptions')
      .update({
        status: 'sent',
        cuir,
        vendor_name: 'autamedica',
        vendor_id: cuir,
        qr_code_content: qrCodeContent,
        signed_pdf_url: signedPdfUrl,
        clinical_data: {
          items,
          diagnosis,
          notes,
          country_code: countryCode,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', prescriptionId)
      .select('id, cuir, qr_code_content, signed_pdf_url, status, created_at')
      .single();

    if (updateError || !updatedRx) {
      throw new Error(`Failed to update prescription: ${updateError?.message}`);
    }

    // 11. Insert audit event
    const clientIp = req.headers.get('cf-connecting-ip')
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || null;
    const userAgent = req.headers.get('user-agent') || null;

    const { error: auditError } = await serviceClient.from('prescription_audit_events').insert({
      prescription_id: prescriptionId,
      event_type: 'ACT_DIGITAL_SIGNATURE',
      user_id: user.id,
      ip_address: clientIp,
      user_agent: userAgent,
      signature_hash: signatureHash,
      metadata: {
        cuir,
        pdf_path: pdfPath,
        method: 'ELECTRONIC_CUIR_VERIFIED',
        country_code: countryCode,
        timestamp: new Date().toISOString(),
      },
    });

    if (auditError) {
      console.warn('[issue-prescription] Prescription audit event insert warning:', auditError);
    }

    // 12. Create / trigger dispensation order for external fulfillment
    try {
      const firstItem = items[0];
      const todayDate = issuedAt.split('T')[0];
      const expiryDate = expiresAt.split('T')[0];

      await serviceClient.from('dispensation_orders').insert({
        prescription_id: prescriptionId,
        patient_id: patientId,
        doctor_id: doctor.id,
        prescription_type: 'standard',
        medication: firstItem.name || firstItem.generic_name || 'Medicamento',
        formulation: firstItem.dosage || 'No especificada',
        quantity_units: 1,
        duration_days: 30,
        dispense_window_start: todayDate,
        dispense_window_end: expiryDate,
        clinical_semaphore: 'green',
        requires_clarification: false,
      });
    } catch (dispenseErr) {
      console.warn('[issue-prescription] Dispensation order insert notice:', dispenseErr);
    }

    // 13. Return JSON response
    return jsonResponse(
      {
        success: true,
        data: {
          id: updatedRx.id,
          cuir: updatedRx.cuir,
          qr_code_content: updatedRx.qr_code_content,
          signed_pdf_url: updatedRx.signed_pdf_url,
          status: 'sent',
          created_at: updatedRx.created_at,
        },
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('[issue-prescription] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';

    return jsonResponse(
      {
        error: message,
        code: 'INTERNAL_ERROR',
      },
      500,
      corsHeaders,
    );
  }
}

Deno.serve(handler);

