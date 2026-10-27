/**
 * Service-role only adapter. The PDF is uploaded once into a PRIVATE bucket,
 * and a Postgres RPC atomically reserves the session against the draft.
 * No signed status transition occurs in this adapter.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FirmArReservation, FirmArSessionStore } from './firmar-session-orchestrator';

type AdminDatabase = SupabaseClient;

const BUCKET = 'medical-documents';

export function createFirmArSupabaseSessionStore(
  adminClient: unknown,
): FirmArSessionStore {
  // Database types for this new migration are not yet in the shared generated
  // package. This cast is server-only; SQL/RLS enforce the privileged contract.
  const admin = adminClient as AdminDatabase;
  let sourcePath = '';

  return {
    async reserveAndFreeze(data: FirmArReservation, bytes: Uint8Array): Promise<boolean> {
      sourcePath = `certificates/firmar/source/${data.certificateId}/${data.tokenHash}.pdf`;
      const { error: uploadedError } = await admin.storage.from(BUCKET)
        .upload(sourcePath, Uint8Array.from(bytes), {
          contentType: 'application/pdf',
          upsert: false,
          cacheControl: '0',
        });
      if (uploadedError) throw new Error('firmar_source_pdf_upload_failed');

      const { data: reserved, error } = await admin.rpc('firmar_reserve_certificate_signature', {
        p_certificate_id: data.certificateId,
        p_doctor_id: data.doctorId,
        p_signer_cuil: data.signerCuil,
        p_token_hash: data.tokenHash,
        p_original_pdf_sha256: data.originalPdfSha256,
        p_original_pdf_path: sourcePath,
        p_expires_at: data.expiresAt,
      });
      if (error || typeof reserved !== 'string') {
        // A failed reservation must not leave untracked medical PDFs.
        await admin.storage.from(BUCKET).remove([sourcePath]);
        if (error?.code === '23505') return false;
        throw new Error('firmar_request_reservation_failed');
      }
      return true;
    },

    async markAwaitingAuthorization(tokenHash: string, authorizationUrl: string): Promise<void> {
      const parsedUrl = new URL(authorizationUrl);
      if (parsedUrl.protocol !== 'https:' || !['firmar.gob.ar','tst.firmar.gob.ar'].includes(parsedUrl.hostname)) {
        throw new Error('firmar_untrusted_authorization_url');
      }
      const { data, error } = await admin.from('medical_certificate_signature_requests')
        .update({
          status: 'awaiting_doctor_authorization',
          authorization_url: authorizationUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('token_hash', tokenHash)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (error || !data) throw new Error('firmar_session_state_update_failed');
    },

    async markFailed(tokenHash: string): Promise<void> {
      const { error } = await admin.from('medical_certificate_signature_requests')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('token_hash', tokenHash)
        .in('status', ['pending','awaiting_doctor_authorization']);
      if (error) throw new Error('firmar_failed_session_update_failed');
    },
  };
}
