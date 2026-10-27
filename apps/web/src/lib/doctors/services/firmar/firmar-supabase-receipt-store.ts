/**
 * Server-side persistence for VERIFIED FirmAR receipts.
 * Never instantiate it from untrusted browser code.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FirmArStoredSession, FirmArVerifiedReceiptStore } from './firmar-verified-callback-processor';

const BUCKET = 'medical-documents';

async function sha256Hex(pdfBytes: Uint8Array): Promise<string> {
  const stable = Uint8Array.from(pdfBytes);
  const digest = await crypto.subtle.digest('SHA-256', stable.buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createFirmArSupabaseReceiptStore(adminClient: unknown): FirmArVerifiedReceiptStore {
  const admin = adminClient as SupabaseClient;

  return {
    async findByTokenHash(tokenHash: string): Promise<FirmArStoredSession | null> {
      const { data, error } = await admin.from('medical_certificate_signature_requests')
        .select('id,certificate_id,signer_cuil,token_hash,original_pdf_sha256,original_pdf_path,expires_at,status')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error) throw new Error('firmar_session_lookup_failed');
      if (!data) return null;
      return {
        id: data.id as string,
        certificateId: data.certificate_id as string,
        doctorCuil: data.signer_cuil as string,
        tokenHash: data.token_hash as string,
        draftPdfSha256: data.original_pdf_sha256 as string,
        originalPdfPath: data.original_pdf_path as string,
        expiresAt: data.expires_at as string,
        status: data.status as 'pending' | 'awaiting_doctor_authorization',
      };
    },

    async readFrozenSource(path: string): Promise<Uint8Array> {
      if (!/^certificates\/firmar\/source\/[a-f0-9-]{36}\/[a-f0-9]{64}\.pdf$/.test(path)) {
        throw new Error('firmar_invalid_original_pdf_path');
      }
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error('firmar_frozen_source_missing');
      return new Uint8Array(await data.arrayBuffer());
    },

    async persistSignedPdf(certificateId: string, signedBytes: Uint8Array): Promise<string> {
      if (!/^[0-9a-f-]{36}$/i.test(certificateId)) throw new Error('firmar_invalid_certificate_id');
      const path = `certificates/signed/${certificateId}.pdf`;
      const { error } = await admin.storage.from(BUCKET)
        .upload(path, Uint8Array.from(signedBytes), {
          contentType: 'application/pdf', upsert: false, cacheControl: '0',
        });
      if (error) {
        // A callback may be retried after storage succeeded but the DB
        // transaction failed. Never overwrite signed clinical bytes. Allow a
        // retry only if the already-stored private PDF is byte-for-byte equal
        // to the independently verified incoming document (by SHA-256).
        const { data: existing, error: downloadError } = await admin.storage
          .from(BUCKET).download(path);
        if (downloadError || !existing) {
          throw new Error('firmar_signed_pdf_private_upload_failed');
        }
        const savedBytes = new Uint8Array(await existing.arrayBuffer());
        const [savedHash, proposedHash] = await Promise.all([
          sha256Hex(savedBytes), sha256Hex(signedBytes),
        ]);
        if (savedHash !== proposedHash) {
          throw new Error('firmar_signed_pdf_conflict_integrity_mismatch');
        }
      }
      return path;
    },

    async finalizeVerifiedDocument(requestId, result): Promise<boolean> {
      const { data, error } = await admin.rpc('firmar_finalize_verified_signature', {
        p_request_id: requestId,
        p_signed_pdf_sha256: result.signedPdfSha256,
        p_signed_pdf_path: result.signedPdfPath,
        p_signed_at: result.signedAt,
        p_certificate_fingerprint_sha256: result.fingerprintSha256,
      });
      if (error) throw new Error('firmar_atomic_finalization_failed');
      return data === true;
    },
  };
}
