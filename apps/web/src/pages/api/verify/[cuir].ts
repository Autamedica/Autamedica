/**
 * GET /api/verify/:cuir
 * Public endpoint — verifies a prescription by CUIR.
 * No authentication required (pharmacies and patients scan the QR).
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, internalError } from '@/lib/api-helpers';
import { isMedicalCertificatePubliclyVerifiable } from '@/lib/doctors/services/medical-certificate-verification';

export const GET: APIRoute = async ({ params, locals }) => {
  const cuir = params.cuir;
  if (!cuir) return jsonOk({ valid: false, prescription: null });

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);

    const { data: rx, error } = await admin
      .from('prescriptions')
      .select('id, cuir, status, clinical_data, doctor_id, patient_id, signed_pdf_url, qr_code_content, created_at, country_code')
      .eq('cuir', cuir)
      .maybeSingle();

    if (error) {
      logger.error('[verify] Query error', error);
      return internalError();
    }

    if (!rx) {
      const { data: cert, error: certError } = await admin
        .from('medical_certificates')
        .select('id, cuir, status, certificate_type, days_of_rest, start_date, end_date, doctor_id, patient_id, signed_pdf_url, qr_code_content, created_at, country_code, signature_verified_at, signature_hash, signature_method')
        .eq('cuir', cuir)
        .maybeSingle();

      if (certError) {
        logger.error('[verify] Certificate query error', certError);
        return internalError();
      }

      if (!cert) return jsonOk({ valid: false, prescription: null, certificate: null });

      // Fail closed: a database row, locally generated code or unsigned PDF
      // must never be presented as a publicly verified medical certificate.
      if (!isMedicalCertificatePubliclyVerifiable(cert)) {
        return jsonOk({
          valid: false,
          reason: 'certificate_not_verified',
          documentType: 'certificate',
          prescription: null,
          certificate: null,
        });
      }

      let prescriberName = 'Médico';
      let prescriberLicense = '';
      const { data: doctor } = await admin
        .from('doctors')
        .select('user_id, license_number, specialty, license_type, uf_brazil')
        .eq('id', cert.doctor_id)
        .maybeSingle();

      if (doctor) {
        let licPrefix = 'Matrícula';
        if (doctor.license_type === 'CRM' || doctor.uf_brazil) {
          licPrefix = `CRM-${doctor.uf_brazil ?? 'BR'}`;
        } else if (doctor.license_type === 'MSP') {
          licPrefix = 'MSP (Uruguay)';
        } else if (doctor.license_type === 'MN') {
          licPrefix = 'MN';
        } else if (doctor.license_type === 'MP') {
          licPrefix = 'MP';
        }

        prescriberLicense = `${licPrefix}: ${doctor.license_number ?? 'N/D'}`;
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
        .eq('id', cert.patient_id)
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
        documentType: 'certificate',
        certificate: {
          cuir: cert.cuir,
          status: cert.status,
          countryCode: (cert as { country_code?: string })?.country_code ?? 'AR',
          certificateType: cert.certificate_type,
          daysOfRest: cert.days_of_rest,
          startDate: cert.start_date,
          endDate: cert.end_date,
          prescriberName,
          prescriberLicense,
          patientName,
          issuedAt: cert.created_at,
          pdfUrl: cert.signed_pdf_url,
          qrContent: cert.qr_code_content,
        },
        prescription: null,
      });
    }

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
      .select('user_id, license_number, specialty, license_type, uf_brazil')
      .eq('id', rx.doctor_id)
      .maybeSingle();

    if (doctor) {
      let licPrefix = 'Matrícula';
      if (doctor.license_type === 'CRM' || doctor.uf_brazil) {
        licPrefix = `CRM-${doctor.uf_brazil ?? 'BR'}`;
      } else if (doctor.license_type === 'MSP') {
        licPrefix = 'MSP (Uruguay)';
      } else if (doctor.license_type === 'MN') {
        licPrefix = 'MN';
      } else if (doctor.license_type === 'MP') {
        licPrefix = 'MP';
      }

      prescriberLicense = `${licPrefix}: ${doctor.license_number ?? 'N/D'}`;
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
        countryCode: (rx as { country_code?: string })?.country_code ?? 'AR',
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
