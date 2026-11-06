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
      .select('id')
      .eq('cuir', cuir)
      .maybeSingle();

    if (error) {
      logger.error('[verify] Query error', error);
      return internalError();
    }

    if (!rx) {
      const { data: cert, error: certError } = await admin
        .from('medical_certificates')
        .select('*')
        .eq('cuir', cuir)
        .maybeSingle();

      if (certError) {
        logger.error('[verify] Certificate query error', certError);
        return internalError();
      }

      if (!cert) return jsonOk({ valid: false, prescription: null, certificate: null });

      // Fail closed: a database row, locally generated code or unsigned PDF
      // must never be presented as a publicly verified medical certificate.
      if (!isMedicalCertificatePubliclyVerifiable(cert as unknown as Parameters<typeof isMedicalCertificatePubliclyVerifiable>[0])) {
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

      if ((cert as { signature_method?: string }).signature_method === 'electronic_verified') {
        const { data: issuance, error: issuanceError } = await (admin as unknown as import('@supabase/supabase-js').SupabaseClient)
          .from('medical_certificate_electronic_issuances').select('doctor_identity,pdf_hash')
          .eq('certificate_id', cert.id).maybeSingle();
        if (issuanceError || issuance?.pdf_hash !== (cert as { signature_hash?: string }).signature_hash) {
          return jsonOk({ valid: false, reason: 'certificate_not_verified', certificate: null, prescription: null });
        }
        const identity = issuance.doctor_identity as { name: string; license: string; license_type: string };
        prescriberName = identity.name;
        prescriberLicense = `${identity.license_type}: ${identity.license}`;
      }

      return jsonOk({
        valid: true,
        documentType: 'certificate',
        certificate: {
          cuir: cert.cuir,
          status: cert.status,
          countryCode: (cert as { country_code?: string })?.country_code ?? 'AR',
          certificateType: cert.certificate_type,
          daysOfRest: 0,
          startDate: null,
          endDate: null,
          prescriberName,
          prescriberLicense,
          patientName: 'Datos reservados',
          issuedAt: (cert as { signature_verified_at?: string }).signature_verified_at ?? cert.created_at,
          signatureMethod: (cert as { signature_method?: string }).signature_method,
          signatureLabel: (cert as { signature_method?: string }).signature_method === 'electronic_verified'
            ? 'Firma electrónica confirmada por el profesional' : 'Firma digital certificada',
          pdfUrl: null,
          qrContent: cert.qr_code_content,
        },
        prescription: null,
      });
    }

    // P0 fail-closed: presence in the prescriptions table is NOT evidence of a
    // valid, legally dispensable or cryptographically verified prescription.
    // Legacy records may have CUIR, signed_pdf_url and status='sent' even
    // though signature_method='electronic_simple' and no provider proof exists.
    // A future implementation must use independently verified signed PDF and
    // authoritative provider receipts from server-only storage before returning
    // valid=true. Never expose patient identifiers, diagnosis or signed PDFs
    // through this unauthenticated QR endpoint.
    return jsonOk({
      valid: false,
      reason: 'prescription_signature_unverified',
      documentType: 'prescription',
      prescription: null,
      certificate: null,
    });
  } catch (err) {
    logger.error('[verify] Error', err);
    return internalError();
  }
};

