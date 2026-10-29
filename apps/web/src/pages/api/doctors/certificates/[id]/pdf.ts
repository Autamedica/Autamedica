import type { APIRoute } from 'astro';
import { badRequest, forbidden, internalError, notFound, jsonOk } from '@/lib/api-helpers';
import { isAuthed, withAuth } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { loadMedicalCertificateForDoctor } from '@/lib/doctors/services/medical-certificate-pdf-context.service';
import { generateMedicalCertificatePdf } from '@/lib/doctors/services/pdf-medical-certificate.service';
import { isMedicalCertificatePubliclyVerifiable } from '@/lib/doctors/services/medical-certificate-verification';
import { certificateSha256 } from '@/lib/doctors/services/certificate-electronic-assets';
import { logger } from '@autamedica/shared';

/** Private download for the issuing doctor or the patient; never a public PDF. */
export const GET: APIRoute = async ({ request, params, locals }) => {
  const id = params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badRequest('invalid_certificate_id');
  const auth = await withAuth(request, locals);
  if (!isAuthed(auth)) return auth;
  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: cert, error } = await admin.from('medical_certificates').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!cert) return notFound();
    const [{ data: doctor, error: doctorError }, { data: patient, error: patientError }] = await Promise.all([
      admin.from('doctors').select('user_id,active').eq('id', cert.doctor_id).maybeSingle(),
      admin.from('patients').select('user_id').eq('id', cert.patient_id).maybeSingle(),
    ]);
    if (doctorError || patientError) throw doctorError || patientError;
    const isDoctor = doctor?.user_id === auth.user.id && doctor?.active === true;
    const isPatient = patient?.user_id === auth.user.id;
    if (!isDoctor && !isPatient) return notFound();
    let pdf: Uint8Array;
    if (cert.status === 'draft') {
      if (!isDoctor) return notFound();
      const record = await loadMedicalCertificateForDoctor(admin, id, auth.user.id);
      if (!record) return notFound();
      pdf = generateMedicalCertificatePdf(record.pdfInput, 'draft');
    } else if (cert.status === 'signed') {
      if (!isMedicalCertificatePubliclyVerifiable(cert as unknown as Parameters<typeof isMedicalCertificatePubliclyVerifiable>[0])) {
        return forbidden('certificate_signature_unverified');
      }
      const evidence = cert as typeof cert & { signature_hash?: string | null; signature_method?: string | null };
      const hash = evidence.signature_hash;
      const path = evidence.signature_method === 'electronic_verified'
        ? `certificates/electronic/${id}/${hash}.pdf` : `certificates/signed/${id}.pdf`;
      if (!hash || cert.signed_pdf_url !== path) return forbidden('certificate_pdf_path_invalid');
      const { data, error: downloadError } = await admin.storage.from('medical-documents').download(path);
      if (downloadError || !data) return notFound('signed_pdf_missing');
      pdf = new Uint8Array(await data.arrayBuffer());
      if (await certificateSha256(pdf) !== hash) return forbidden('signed_document_integrity_mismatch');
      if (new URL(request.url).searchParams.get('downloadUrl') === 'true') {
        const { data: signed, error: signedError } = await admin.storage.from('medical-documents').createSignedUrl(path, 120);
        if (signedError || !signed) throw signedError;
        const response = jsonOk({ url: signed.signedUrl });
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
    } else return forbidden('certificate_not_available');
    return new Response(Uint8Array.from(pdf).buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="autamedica-${id}-${cert.status}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    logger.error('[certificates/pdf] download failed', { certificateId: id });
    return internalError('certificate_pdf_failed');
  }
};
