import type { APIRoute } from 'astro';
import { badRequest, forbidden, internalError, notFound, jsonOk } from '@/lib/api-helpers';
import { isAuthed, withAuth } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

/** Private PAdES PDF download for the issuing doctor or the patient. */
export const GET: APIRoute = async ({ request, params, locals }) => {
  const id = params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badRequest('invalid_prescription_id');
  const auth = await withAuth(request, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: rx, error } = await admin.from('prescriptions')
      .select('id,doctor_id,patient_id,status,cuir,signed_pdf_url,signature_method')
      .eq('id', id).maybeSingle();
    if (error) throw error;
    if (rx?.status !== 'active' || !rx.cuir || rx.signature_method !== 'ac_external') return notFound();

    const [{ data: doctor, error: doctorError }, { data: patient, error: patientError }] = await Promise.all([
      admin.from('doctors').select('user_id,active').eq('id', rx.doctor_id).maybeSingle(),
      admin.from('patients').select('user_id').eq('id', rx.patient_id).maybeSingle(),
    ]);
    if (doctorError || patientError) throw doctorError || patientError;
    const isDoctor = doctor?.user_id === auth.user.id && doctor.active === true;
    const isPatient = patient?.user_id === auth.user.id;
    if (!isDoctor && !isPatient) return notFound();

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
    const hash = signatureEvent?.signature_hash;
    const path = String(issueMeta?.pdfPath ?? '');
    if (!hash || issueMeta?.signature_hash !== hash ||
        signatureMeta?.method !== 'PAdES_AC_EXTERNAL' ||
        signatureMeta?.document_hash !== hash ||
        !path.startsWith(`prescriptions/${rx.cuir}/`) || !path.endsWith('.pdf')) {
      return forbidden('prescription_signature_evidence_invalid');
    }

    const { data: pdf, error: downloadError } = await admin.storage.from('medical-documents').download(path);
    if (downloadError || !pdf) return notFound('signed_pdf_missing');
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', pdfBytes);
    const actualHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (actualHash !== hash) return forbidden('prescription_pdf_integrity_mismatch');

    if (new URL(request.url).searchParams.get('downloadUrl') === 'true') {
      const { data: signed, error: signedError } = await admin.storage.from('medical-documents').createSignedUrl(path, 120);
      if (signedError || !signed) throw signedError;
      const response = jsonOk({ url: signed.signedUrl });
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }

    return new Response(pdfBytes.buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="autamedica-${id}-signed.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    logger.error('[prescriptions/pdf] download failed', { prescriptionId: id });
    return internalError('prescription_pdf_failed');
  }
};
