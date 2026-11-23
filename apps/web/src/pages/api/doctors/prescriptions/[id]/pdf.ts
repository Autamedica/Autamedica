import type { APIRoute } from 'astro';
import { badRequest, forbidden, internalError, notFound, jsonOk } from '@/lib/api-helpers';
import { isAuthed, withAuth } from '@/lib/api-auth';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

/** Private PAdES PDF download for the issuing doctor or the patient. */
export function supportsSignedPrescriptionDownload(countryCode: string | null, signatureMethod: string | null): boolean {
  return signatureMethod === 'ac_external' || (countryCode === 'AR' && signatureMethod === 'electronic_simple');
}
export const GET: APIRoute = async ({ request, params, locals }) => {
  const id = params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badRequest('invalid_prescription_id');
  // Patient mobile clients authenticate with a Supabase Bearer token; the
  // patient resolver validates it with Auth and binds it to the real patient row.
  const patientContext = await resolvePatientContext(request, locals);
  let authenticatedUserId = patientContext?.userId ?? null;

  // Issuing doctors may continue using their existing authenticated web session.
  if (!authenticatedUserId) {
    const auth = await withAuth(request, locals);
    if (!isAuthed(auth)) return auth;
    authenticatedUserId = auth.user.id;
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: rx, error } = await admin.from('prescriptions')
      .select('id,doctor_id,patient_id,status,country_code,cuir,signed_pdf_url,signature_method,pdf_sha256,pdf_byte_length,pdf_storage_path')
      .eq('id', id).maybeSingle();
    if (error) throw error;
    if (rx?.status !== 'active') return notFound();
    const isArgentineGovernancePades = rx.country_code === 'AR' && rx.signature_method === 'electronic_simple';
    if (!rx.cuir || !supportsSignedPrescriptionDownload(rx.country_code, rx.signature_method)) return notFound();

    const [{ data: doctor, error: doctorError }, { data: patient, error: patientError }] = await Promise.all([
      admin.from('doctors').select('user_id,active').eq('id', rx.doctor_id).maybeSingle(),
      admin.from('patients').select('user_id').eq('id', rx.patient_id).maybeSingle(),
    ]);
    if (doctorError || patientError) throw doctorError || patientError;
    const isDoctor = doctor?.user_id === authenticatedUserId && doctor.active === true;
    const isPatient = patientContext?.userId === authenticatedUserId
      && patientContext.patientId === rx.patient_id
      && patient?.user_id === authenticatedUserId;
    if (!isDoctor && !isPatient) return forbidden('prescription_access_denied');

    const [{ data: signatureEvent, error: signatureError }, { data: issueEvent, error: issueError }] = await Promise.all([
      admin.from('prescription_audit_events').select('signature_hash,metadata')
        .eq('prescription_id', id).eq('event_type', 'ACT_DIGITAL_SIGNATURE')
        .order('timestamp', { ascending: false }).limit(1).maybeSingle(),
      admin.from('prescription_audit_events').select('signature_hash,metadata')
        .eq('prescription_id', id).eq('event_type', 'issued')
        .order('timestamp', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (signatureError || issueError) throw signatureError || issueError;
    const signatureMeta = signatureEvent?.metadata as Record<string, unknown> | null;
    const issueMeta = issueEvent?.metadata as Record<string, unknown> | null;
    const auditHash = signatureEvent?.signature_hash;
    const path = String(issueMeta?.pdfPath ?? '');
    if (!auditHash || issueMeta?.signature_hash !== auditHash ||
        (signatureMeta?.method !== 'PAdES_AC_EXTERNAL' && !(isArgentineGovernancePades && signatureMeta?.method === 'PAdES_GOVERNANCE_POLICY')) ||
        signatureMeta?.document_hash !== auditHash ||
        !path.startsWith(`prescriptions/${rx.cuir}/`) || !path.endsWith('.pdf') ||
        (rx.pdf_sha256 && rx.pdf_sha256 !== auditHash) ||
        (rx.pdf_storage_path && rx.pdf_storage_path !== path)) {
      return forbidden('prescription_signature_evidence_invalid');
    }

    const { data: pdf, error: downloadError } = await admin.storage.from('medical-documents').download(path);
    if (downloadError || !pdf) return notFound('signed_pdf_missing');
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', pdfBytes.buffer as ArrayBuffer);
    const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (actualHash !== auditHash ||
        (rx.pdf_sha256 && actualHash !== rx.pdf_sha256) ||
        (rx.pdf_byte_length !== null && rx.pdf_byte_length !== undefined && Number(rx.pdf_byte_length) !== pdfBytes.byteLength)) {
      return forbidden('prescription_pdf_integrity_mismatch');
    }

    if (new URL(request.url).searchParams.get('downloadUrl') === 'true') {
      const { data: signed, error: signedError } = await admin.storage.from('medical-documents').createSignedUrl(path, 120);
      if (signedError || !signed) throw signedError;
      const response = jsonOk({
        url: signed.signedUrl,
        sha256: actualHash,
        byteLength: pdfBytes.byteLength,
      });
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }

    return new Response(pdfBytes.buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="autamedica-${id}-signed.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Content-SHA256': actualHash,
        'X-Content-Length': String(pdfBytes.byteLength),
        'X-PDF-Integrity': 'verified',
      },
    });
  } catch {
    logger.error('[prescriptions/pdf] download failed', { prescriptionId: id });
    return internalError('prescription_pdf_failed');
  }
};
