import type { APIRoute } from 'astro';
import { badRequest, forbidden, internalError, notFound } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { loadMedicalCertificateForDoctor } from '@/lib/doctors/services/medical-certificate-pdf-context.service';
import { generateMedicalCertificatePdf } from '@/lib/doctors/services/pdf-medical-certificate.service';
import { isMedicalCertificatePubliclyVerifiable } from '@/lib/doctors/services/medical-certificate-verification';
import { logger } from '@autamedica/shared';

/**
 * Doctor-only private download. Drafts are clearly watermarked and never
 * surfaced to the patient/public verification endpoints.
 */
export const GET: APIRoute = async ({ request, params, locals }) => {
  const id = params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badRequest('invalid_certificate_id');
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const record = await loadMedicalCertificateForDoctor(admin, id, auth.user.id);
    if (!record) return notFound('certificate_not_found');

    let pdf: Uint8Array;
    if (record.status === 'draft') {
      const path = `certificates/drafts/${id}.pdf`;
      // Render a fresh private preview so changes to the draft are reflected.
      pdf = generateMedicalCertificatePdf(record.pdfInput, 'draft');
      const { error: uploadError } = await admin.storage
        .from('medical-documents').upload(path, pdf, {
          contentType: 'application/pdf', upsert: true,
        });
      if (uploadError) throw uploadError;
    } else if (record.status === 'signed') {
      const { data: cert } = await admin.from('medical_certificates')
        .select('*').eq('id', id).maybeSingle();
      if (!cert || !isMedicalCertificatePubliclyVerifiable(
        cert as unknown as Parameters<typeof isMedicalCertificatePubliclyVerifiable>[0],
      )) return forbidden('certificate_signature_unverified');
      const { data, error } = await admin.storage.from('medical-documents')
        .download(`certificates/signed/${id}.pdf`);
      if (error || !data) return notFound('signed_pdf_missing');
      const signedBytes = await data.arrayBuffer();
      pdf = new Uint8Array(signedBytes);
      const digest = await crypto.subtle.digest('SHA-256', signedBytes);
      const actualHash = Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      const expectedHash = (cert as typeof cert & { signature_hash?: string | null }).signature_hash;
      if (!expectedHash || actualHash !== expectedHash) {
        return forbidden('signed_document_integrity_mismatch');
      }
    } else {
      return forbidden('certificate_not_available');
    }

    const body = Uint8Array.from(pdf);
    return new Response(body.buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="autamedica-${id}-${record.status}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error('[certificates/pdf] failed', error);
    return internalError('certificate_pdf_failed');
  }
};
