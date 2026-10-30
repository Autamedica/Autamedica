import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withAuthRole, isAuthed } from '@/lib/api-auth';
import { badRequest, forbidden, notFound, conflict, jsonOk, internalError } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { loadElectronicCertificateSource, assertElectronicCertificateEligible,
  issueElectronicCertificate, ELECTRONIC_CONFIRMATION } from '@/lib/doctors/services/certificate-electronic-issuance.service';
import { logger } from '@autamedica/shared';
import { doctorHasPatientAccess } from '@/lib/doctors/lib/resolve-room';
import { isMedicalCertificatePubliclyVerifiable } from '@/lib/doctors/services/medical-certificate-verification';

const validId = (id?: string): id is string => Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));

export const GET: APIRoute = async ({ request, params, locals }) => {
  if (!validId(params.id)) return badRequest('invalid_certificate_id');
  const auth = await withAuthRole(request, ['doctor'], locals);
  if (!isAuthed(auth)) return auth;
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
    const source = await loadElectronicCertificateSource(admin, params.id, auth.user.id);
    if (!source) return notFound();
    if (!await doctorHasPatientAccess(admin, String(source.doctor.id), String(source.certificate.patient_id))) return forbidden();
    if (source.certificate.status === 'signed') {
      const { data: evidence, error } = await admin.from('medical_certificate_electronic_issuances')
        .select('pdf_hash').eq('certificate_id', params.id).maybeSingle();
      if (error || !evidence || evidence.pdf_hash !== source.certificate.signature_hash ||
          !isMedicalCertificatePubliclyVerifiable(source.certificate as unknown as Parameters<typeof isMedicalCertificatePubliclyVerifiable>[0])) {
        return conflict('certificate_signature_unverified');
      }
      return jsonOk({ status: 'signed', certificate: source.certificate });
    }
    try { assertElectronicCertificateEligible(source); }
    catch (error) { return forbidden(error instanceof Error ? error.message : 'certificate_not_eligible'); }
    const response = jsonOk({ status: 'draft', snapshotHash: source.snapshotHash,
      confirmation: ELECTRONIC_CONFIRMATION, signatureMethod: 'electronic_verified',
      certificate: source.certificate,
      patientName: [source.patientProfile.first_name, source.patientProfile.last_name].filter(Boolean).join(' '),
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return internalError('certificate_review_failed');
  }
};

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!validId(params.id)) return badRequest('invalid_certificate_id');
  const auth = await withAuthRole(request, ['doctor'], locals);
  if (!isAuthed(auth)) return auth;
  // Native bearer requests have no Origin. Cookie requests must be same-origin.
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) ||
      (!origin && !/^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? ''))) {
    return forbidden('certificate_cross_origin_request');
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return badRequest('json_required');
  let body: { confirmed?: unknown; snapshotHash?: unknown };
  try { body = await request.json(); } catch { return badRequest('invalid_json'); }
  if (body?.confirmed !== true || typeof body.snapshotHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(body.snapshotHash)) return badRequest('certificate_confirmation_required');
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
    const source = await loadElectronicCertificateSource(admin, params.id, auth.user.id);
    if (!source) return notFound();
    if (!await doctorHasPatientAccess(admin, String(source.doctor.id), String(source.certificate.patient_id))) return forbidden();
    if (source.certificate.status === 'signed') {
      if (!isMedicalCertificatePubliclyVerifiable(source.certificate as unknown as Parameters<typeof isMedicalCertificatePubliclyVerifiable>[0])) {
        return conflict('certificate_signature_unverified');
      }
      const { data: evidence, error } = await admin.from('medical_certificate_electronic_issuances')
        .select('snapshot_hash,pdf_hash').eq('certificate_id', params.id).maybeSingle();
      if (error || evidence?.snapshot_hash !== body.snapshotHash ||
          evidence.pdf_hash !== source.certificate.signature_hash) return conflict('certificate_already_issued');
      return jsonOk(source.certificate);
    }
    if (source.snapshotHash !== body.snapshotHash) return conflict('certificate_changed_review_again');
    try { assertElectronicCertificateEligible(source); }
    catch (error) { return forbidden(error instanceof Error ? error.message : 'certificate_not_eligible'); }
    const env = locals.runtime?.env as Record<string, unknown> | undefined;
    const storageOrigin = String(env?.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || '');
    const issued = await issueElectronicCertificate(admin, source, auth.user.id, storageOrigin);
    return jsonOk(issued);
  } catch (error) {
    logger.error('[certificate/electronic] issuance failed', { certificateId: params.id,
      reason: error instanceof Error ? error.message : 'unknown' });
    return conflict('No se pudo emitir. El borrador se conserva; revise firma, sello y datos antes de reintentar.');
  }
};
