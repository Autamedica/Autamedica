import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { badRequest, forbidden, internalError, jsonOk, conflict } from '@/lib/api-helpers';
import { isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { certificateAssetPath, assertCertificateImage } from '@/lib/doctors/services/certificate-electronic-assets';
import { logger } from '@autamedica/shared';

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const ARCHIVE_CONFIRMATION = 'Confirmo que emití este documento y autorizo su registro para verificación de integridad en AutaMedica.';

const clean = (value: FormDataEntryValue | null, max = 500): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stable = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stable.buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Authenticated issuer endpoint for documents prepared outside AutaMedica.
 * It archives the exact PDF hash under the doctor's own identity. The recipient
 * cannot call this endpoint or alter an existing archive entry.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ['doctor'], locals);
  if (!isAuthed(auth)) return auth;

  const origin = request.headers.get('origin');
  const bearer = /^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '');
  if ((origin && origin !== new URL(request.url).origin) || (!origin && !bearer)) {
    return forbidden('document_archive_cross_origin_request');
  }

  try {
    const form = await request.formData();
    const reference = clean(form.get('reference'), 36).toUpperCase();
    const documentDate = clean(form.get('document_date'), 10);
    const patientName = clean(form.get('patient_name'), 200);
    const patientDocument = clean(form.get('patient_document'), 80);
    const patientId = clean(form.get('patient_id'), 36);
    const documentType = clean(form.get('document_type'), 100);
    const description = clean(form.get('document_description'), 2000);
    const statement = clean(form.get('authorization_statement'), 300);
    const file = form.get('pdf');

    if (!/^DOC-[A-F0-9]{32}$/.test(reference)) return badRequest('invalid_document_archive_reference');
    if (!isIsoDate(documentDate)) return badRequest('invalid_document_date');
    if (!patientName || !patientDocument || !documentType) return badRequest('document_archive_metadata_required');
    if (patientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(patientId)) {
      return badRequest('invalid_patient_id');
    }
    if (statement !== ARCHIVE_CONFIRMATION) return forbidden('physician_document_attestation_required');
    if (!(file instanceof File) || file.size < 8 || file.size > MAX_PDF_BYTES) {
      return badRequest('invalid_pdf_size');
    }

    const pdfBytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...pdfBytes.subarray(0, 5)) !== '%PDF-') {
      return badRequest('invalid_pdf');
    }
    const pdfSha256 = await sha256Hex(pdfBytes);

    const admin = createAstroAdminClient(locals.runtime?.env);
    const db = admin as unknown as SupabaseClient;
    const { data: doctor, error: doctorError } = await db.from('doctors')
      .select('id,user_id,active,care_country,license_type,license_number,enrollment_jurisdiction,uf_brazil,signature_image_url,stamp_image_url,signature_url,stamp_url')
      .eq('user_id', auth.user.id).maybeSingle();
    if (doctorError) throw doctorError;
    if (!doctor?.id || doctor.active !== true || doctor.user_id !== auth.user.id) {
      return forbidden('active_doctor_profile_required');
    }

    if (patientId) {
      const { data: linkedPatient, error: patientError } = await db.from('patients')
        .select('id,care_country,dni,cpf,active')
        .eq('id', patientId)
        .maybeSingle();
      if (patientError) throw patientError;
      const storedDocument = linkedPatient?.care_country === 'BR'
        ? String(linkedPatient.cpf ?? '')
        : linkedPatient?.care_country === 'AR'
          ? String(linkedPatient.dni ?? '')
          : '';
      const normalizeDocument = (value: string) => value.replace(/[^0-9]/g, '');
      if (!linkedPatient || linkedPatient.active !== true ||
          linkedPatient.care_country !== doctor.care_country ||
          !normalizeDocument(storedDocument) ||
          normalizeDocument(storedDocument) !== normalizeDocument(patientDocument)) {
        return forbidden('document_archive_patient_identity_mismatch');
      }
    }

    const { data: profile, error: profileError } = await db.from('profiles')
      .select('first_name,last_name,role,active,deleted_at')
      .eq('user_id', auth.user.id).maybeSingle();
    if (profileError) throw profileError;
    const issuerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    const jurisdiction = String(doctor.enrollment_jurisdiction || doctor.uf_brazil || '').trim();
    if (profile?.role !== 'doctor' || profile.active !== true || profile.deleted_at ||
        !issuerName || !String(doctor.license_type ?? '').trim() ||
        !String(doctor.license_number ?? '').trim() || !jurisdiction) {
      return forbidden('doctor_issuer_identity_incomplete');
    }

    const runtime = (locals.runtime?.env ?? {}) as Record<string, unknown>;
    const storageOrigin = String(runtime.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL ?? '');
    if (!storageOrigin) return internalError('document_archive_storage_not_configured');

    const getAssetHash = async (type: 'signature' | 'stamp'): Promise<string> => {
      const value = doctor[type === 'signature' ? 'signature_image_url' : 'stamp_image_url'] ||
        doctor[type === 'signature' ? 'signature_url' : 'stamp_url'];
      if (typeof value !== 'string' || !value.trim()) throw new Error('doctor_signature_assets_missing');
      const path = certificateAssetPath(value, storageOrigin, auth.user.id, String(doctor.id), type);
      const { data, error } = await admin.storage.from('medical-documents').download(path);
      if (error || !data) throw new Error('doctor_signature_assets_unavailable');
      const bytes = new Uint8Array(await data.arrayBuffer());
      assertCertificateImage(bytes);
      return sha256Hex(bytes);
    };
    const [signatureImageSha256, stampImageSha256] = await Promise.all([
      getAssetHash('signature'), getAssetHash('stamp'),
    ]);

    const registeredAt = new Date().toISOString();
    const storagePath = `document-archives/${reference}/${pdfSha256}.pdf`;
    const storage = admin.storage.from('medical-documents');
    const { error: uploadError } = await storage.upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadError) {
      if (uploadError.code === 'Duplicate') return conflict('document_reference_or_pdf_already_registered');
      throw uploadError;
    }

    const { error: archiveError } = await db.rpc('register_medical_document_archive', {
      p_reference: reference,
      p_doctor_id: doctor.id,
      p_document_date: documentDate,
      p_pdf_sha256: pdfSha256,
      p_issuer_snapshot: {
        name: issuerName,
        profession: 'Médico',
        license: `${doctor.license_type}: ${doctor.license_number}`,
        jurisdiction,
      },
      p_patient_snapshot: { name: patientName, document_number: patientDocument },
      p_clinical_snapshot: { document_type: documentType, description },
      p_authorization_snapshot: {
        source: 'physician_attested_upload',
        statement: ARCHIVE_CONFIRMATION,
        registered_by: auth.user.id,
        registered_at: registeredAt,
      },
      p_signature_image_sha256: signatureImageSha256,
      p_stamp_image_sha256: stampImageSha256,
      p_patient_id: patientId || null,
      p_patient_document_number: patientId ? patientDocument : null,
    });
    if (archiveError) {
      const { error: cleanupError } = await storage.remove([storagePath]);
      if (cleanupError) {
        logger.error('[doctors/document-archive] orphan PDF cleanup failed', {
          reference,
          reason: cleanupError.message,
        });
      }
      if (archiveError.code === '23505') return conflict('document_reference_or_pdf_already_registered');
      throw archiveError;
    }

    const verificationUrl = `/verify/documentos/${reference}`;
    const response = jsonOk({ ok: true, reference, pdfSha256, verificationUrl, patientLinked: Boolean(patientId) }, 201);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    if (reason === 'doctor_signature_assets_missing' || reason === 'doctor_signature_assets_unavailable') {
      return forbidden(reason);
    }
    logger.error('[doctors/document-archive] issuer registration failed', { reason });
    return internalError('document_archive_registration_failed');
  }
};
