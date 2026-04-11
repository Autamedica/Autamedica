/**
 * GET /api/verify/:cuir
 * Public endpoint — verifies a prescription by CUIR.
 * No authentication required (pharmacies and patients scan the QR).
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, internalError } from '@/lib/api-helpers';

export const GET: APIRoute = async ({ params, locals }) => {
  const cuir = params.cuir;
  if (!cuir) return jsonOk({ valid: false, prescription: null });

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);

    const { data: rx, error } = await admin
      .from('prescriptions')
      .select('id, cuir, status, clinical_data, doctor_id, patient_id, signed_pdf_url, qr_code_content, created_at')
      .eq('cuir', cuir)
      .maybeSingle();

    if (error) {
      logger.error('[verify] Query error', error);
      return internalError();
    }

    if (!rx) return jsonOk({ valid: false, prescription: null });

    const clinicalData = rx.clinical_data as {
      items?: Array<{ generic_name?: string; dosage?: string; quantity?: number }>;
      diagnosis?: string;
    };
    const item = clinicalData?.items?.[0];

    // Resolve names
    let prescriberName = 'Médico';
    let prescriberLicense = '';
    const { data: doctor } = await admin
      .from('doctors')
      .select('user_id, license_number, specialty')
      .eq('id', rx.doctor_id)
      .maybeSingle();

    if (doctor) {
      prescriberLicense = `Matrícula: ${doctor.license_number ?? 'N/D'}`;
      if (doctor.specialty) prescriberLicense += ` | ${doctor.specialty}`;
      const { data: dProfile } = await admin
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', doctor.user_id)
        .maybeSingle();
      if (dProfile) prescriberName = `Dr. ${dProfile.first_name ?? ''} ${dProfile.last_name ?? ''}`.trim();
    }

    let patientName = 'Paciente';
    const { data: patient } = await admin
      .from('patients')
      .select('user_id')
      .eq('id', rx.patient_id)
      .maybeSingle();
    if (patient) {
      const { data: pProfile } = await admin
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', patient.user_id)
        .maybeSingle();
      if (pProfile) patientName = `${pProfile.first_name ?? ''} ${pProfile.last_name ?? ''}`.trim();
    }

    return jsonOk({
      valid: true,
      prescription: {
        cuir: rx.cuir,
        status: rx.status,
        medication: item?.generic_name ?? 'Sin especificar',
        dosage: item?.dosage ?? '',
        quantity: item?.quantity ?? 0,
        diagnosis: clinicalData?.diagnosis ?? '',
        prescriberName,
        prescriberLicense,
        patientName,
        issuedAt: rx.created_at,
        pdfUrl: rx.signed_pdf_url,
        qrContent: rx.qr_code_content,
      },
    });
  } catch (err) {
    logger.error('[verify] Error', err);
    return internalError();
  }
};
