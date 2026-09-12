import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/auth-helpers.ts';
import {
  generateMedicalOrderPdfBytes,
  type MedicalOrderPractice,
} from '../_shared/pdf-helpers.ts';

const VALID_STUDY_TYPES = new Set(['laboratory', 'imaging', 'cardiology', 'other']);

function generateOrderCuir(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  let randomPart = '';
  for (let i = 0; i < 8; i++) {
    randomPart += chars[randomBytes[i] % chars.length];
  }
  return `O-${randomPart}`;
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

    // 1. Verify doctor profile and role
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('first_name, last_name, role, active, matricula_nacional')
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

    // 2. Verify active doctor record
    const { data: doctor, error: doctorError } = await serviceClient
      .from('doctors')
      .select('id, user_id, active, license_number, license_jurisdiction, enrollment_jurisdiction, refeps_id, specialty')
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

    let orderId = body.orderId ? String(body.orderId) : undefined;
    let patientId = body.patientId ? String(body.patientId) : undefined;
    let studyType = typeof body.studyType === 'string' ? body.studyType.toLowerCase() : undefined;
    let practices: MedicalOrderPractice[] = Array.isArray(body.practices) ? body.practices : [];
    let diagnosis = typeof body.diagnosis === 'string' ? body.diagnosis.trim() : '';
    let notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    let orderCreatedAt = new Date().toISOString();

    // 3. Check existing draft or validate draft payload
    if (orderId) {
      const { data: existingOrder, error: orderFetchError } = await serviceClient
        .from('medical_orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (orderFetchError || !existingOrder) {
        return jsonResponse(
          { error: 'Medical order draft not found', code: 'ORDER_NOT_FOUND' },
          404,
          corsHeaders,
        );
      }

      if (existingOrder.doctor_id !== doctor.id) {
        return jsonResponse(
          {
            error: 'Forbidden: Medical order does not belong to authenticated doctor',
            code: 'FORBIDDEN_ORDER',
          },
          403,
          corsHeaders,
        );
      }

      if (existingOrder.status !== 'draft') {
        return jsonResponse(
          {
            error: `Only draft medical orders can be issued (current status: '${existingOrder.status}')`,
            code: 'INVALID_STATUS',
          },
          409,
          corsHeaders,
        );
      }

      orderCreatedAt = existingOrder.created_at || orderCreatedAt;
      patientId = patientId || existingOrder.patient_id;
      studyType = studyType || existingOrder.study_type;

      if (practices.length === 0 && Array.isArray(existingOrder.practices)) {
        practices = existingOrder.practices as MedicalOrderPractice[];
      }
      if (!diagnosis && typeof existingOrder.diagnosis === 'string') {
        diagnosis = existingOrder.diagnosis;
      }
      if (!notes && typeof existingOrder.notes === 'string') {
        notes = existingOrder.notes;
      }
    }

    if (!patientId) {
      return jsonResponse(
        { error: 'patientId is required', code: 'PATIENT_ID_REQUIRED' },
        400,
        corsHeaders,
      );
    }

    if (!studyType || !VALID_STUDY_TYPES.has(studyType)) {
      return jsonResponse(
        {
          error: `studyType must be one of: ${Array.from(VALID_STUDY_TYPES).join(', ')}`,
          code: 'INVALID_STUDY_TYPE',
        },
        400,
        corsHeaders,
      );
    }

    if (!practices || practices.length === 0) {
      return jsonResponse(
        { error: 'practices array must contain at least one requested study', code: 'PRACTICES_REQUIRED' },
        400,
        corsHeaders,
      );
    }

    // 4. Insert draft order if orderId wasn't provided
    if (!orderId) {
      const { data: insertedOrder, error: insertError } = await serviceClient
        .from('medical_orders')
        .insert({
          doctor_id: doctor.id,
          patient_id: patientId,
          status: 'draft',
          study_type: studyType,
          practices,
          diagnosis,
          notes,
        })
        .select('id, created_at')
        .single();

      if (insertError || !insertedOrder) {
        throw new Error(`Failed to insert medical order: ${insertError?.message || 'unknown error'}`);
      }

      orderId = insertedOrder.id;
      orderCreatedAt = insertedOrder.created_at;
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

    // 6. Generate CUIR and QR code
    const cuir = generateOrderCuir();
    const qrCodeContent = `https://autamedica.com/orders/${cuir}`;

    // 7. Render official PDF
    const doctorName = `Dr/Dra. ${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Médico';
    const doctorLicense = doctor.license_number || profile.matricula_nacional || 'S/N';
    const doctorJurisdiction = doctor.license_jurisdiction || doctor.enrollment_jurisdiction || 'Nacional';

    const pdfBytes = generateMedicalOrderPdfBytes({
      cuir,
      issuedAt: orderCreatedAt,
      studyType,
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
      practices,
      diagnosis,
      notes,
    });

    // 8. Upload to bucket medical-documents in medical-orders/${orderId}.pdf
    const pdfPath = `medical-orders/${orderId}.pdf`;
    const { error: uploadError } = await serviceClient.storage
      .from('medical-documents')
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload medical order PDF: ${uploadError.message}`);
    }

    // 9. Generate signed URL (1 year validity)
    const { data: urlData, error: urlError } = await serviceClient.storage
      .from('medical-documents')
      .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);

    if (urlError || !urlData?.signedUrl) {
      throw new Error(`Failed to generate signed URL for medical order: ${urlError?.message || 'missing url'}`);
    }
    const signedPdfUrl = urlData.signedUrl;

    // 10. Update medical_orders status to 'signed'
    const { data: updatedOrder, error: updateError } = await serviceClient
      .from('medical_orders')
      .update({
        status: 'signed',
        cuir,
        qr_code_content: qrCodeContent,
        signed_pdf_url: signedPdfUrl,
        study_type: studyType,
        practices,
        diagnosis,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('id, cuir, qr_code_content, signed_pdf_url, status, created_at')
      .single();

    if (updateError || !updatedOrder) {
      throw new Error(`Failed to update medical order: ${updateError?.message}`);
    }

    // 11. Return JSON response
    return jsonResponse(
      {
        success: true,
        data: {
          id: updatedOrder.id,
          cuir: updatedOrder.cuir,
          qr_code_content: updatedOrder.qr_code_content,
          signed_pdf_url: updatedOrder.signed_pdf_url,
          status: 'signed',
          created_at: updatedOrder.created_at,
        },
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('[issue-medical-order] Unexpected error:', error);
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
