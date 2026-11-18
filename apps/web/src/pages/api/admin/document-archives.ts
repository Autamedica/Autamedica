import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const clean = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = createAstroServerClientFromRequest(request, locals.runtime?.env);
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return json({ error: 'authentication_required' }, 401);
    const { data: profile } = await auth.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
    const role = String((user.app_metadata as Record<string, unknown> | undefined)?.role ?? profile?.role ?? '');
    if (!['platform_admin', 'admin'].includes(role)) return json({ error: 'platform_admin_required' }, 403);

    const form = await request.formData();
    const file = form.get('pdf');
    if (!(file instanceof File) || file.size < 8 || file.size > 25 * 1024 * 1024) return json({ error: 'invalid_pdf_size' }, 400);
    const bytes = await file.arrayBuffer();
    const signature = new Uint8Array(bytes.slice(0, 5));
    if (String.fromCharCode(...signature) !== '%PDF-') return json({ error: 'invalid_pdf' }, 415);

    const doctorId = clean(form.get('doctor_id'), 80);
    const documentDate = clean(form.get('document_date'), 10);
    const issuer = {
      name: clean(form.get('issuer_name')), profession: clean(form.get('issuer_profession')),
      license: clean(form.get('issuer_license')), jurisdiction: clean(form.get('issuer_jurisdiction')),
    };
    const patient = { name: clean(form.get('patient_name')), document_number: clean(form.get('patient_document'), 80) };
    const clinical = { document_type: clean(form.get('document_type')), description: clean(form.get('document_description'), 2000) };
    const authorizationStatement = clean(form.get('authorization_statement'), 2000);
    const signatureImageSha256 = clean(form.get('signature_image_sha256'), 64).toLowerCase();
    const stampImageSha256 = clean(form.get('stamp_image_sha256'), 64).toLowerCase();
    if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate) ||
      Object.values(issuer).some(v => !v) || Object.values(patient).some(v => !v) ||
      !clinical.document_type || !authorizationStatement ||
      !/^[a-f0-9]{64}$/.test(signatureImageSha256) || !/^[a-f0-9]{64}$/.test(stampImageSha256)) {
      return json({ error: 'missing_or_invalid_metadata' }, 400);
    }
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
    const { data: doctor, error: doctorError } = await admin.from('doctors').select('id').eq('id', doctorId).maybeSingle();
    if (doctorError || !doctor) return json({ error: 'doctor_not_found' }, 404);

    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const pdfSha256 = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    const reference = 'DOC-' + crypto.randomUUID().replace(/-/g, '').toUpperCase();
    const { error } = await admin.from('medical_document_archives').insert({
      reference, doctor_id: doctorId, document_date: documentDate, status: 'registered',
      signature_type: 'scanned_signature', pdf_sha256: pdfSha256,
      issuer_snapshot: issuer, patient_snapshot: patient, clinical_snapshot: clinical,
      authorization_snapshot: {
        source: 'physician_authorization_reported_by_operator',
        statement: authorizationStatement, registered_by: user.id, registered_at: new Date().toISOString(),
      },
      signature_image_sha256: signatureImageSha256, stamp_image_sha256: stampImageSha256,
    });
    if (error) {
      if (error.code === '23505') return json({ error: 'document_or_hash_already_registered' }, 409);
      return json({ error: 'archive_registration_failed' }, 500);
    }
    return json({ ok: true, reference, pdfSha256, verificationUrl: `/verify/documentos/${reference}` }, 201);
  } catch {
    return json({ error: 'archive_registration_failed' }, 500);
  }
};
