/**
 * Verified FirmAR receipt pipeline, intentionally NOT exposed as an HTTP POST.
 * The API callback remains 503 until an independent trusted PAdES verifier
 * is implemented and its production credentials are approved.
 */
import {
  hashFirmArToken,
  parseFirmArCallback,
  validateFirmArSignedDocument,
} from './firmar-callback';
import type { IndependentPadesVerifier, PendingFirmArRequest } from './firmar-callback';

export interface FirmArStoredSession extends PendingFirmArRequest {
  id: string;
  originalPdfPath: string;
}

export interface FirmArVerifiedReceiptStore {
  findByTokenHash(tokenHash: string): Promise<FirmArStoredSession | null>;
  readFrozenSource(path: string): Promise<Uint8Array>;
  persistSignedPdf(certificateId: string, signedBytes: Uint8Array): Promise<string>;
  finalizeVerifiedDocument(requestId: string, result: {
    signedPdfSha256: string;
    signedPdfPath: string;
    signedAt: string;
    fingerprintSha256: string;
  }): Promise<boolean>;
}

async function digestSha256(bytes: Uint8Array): Promise<string> {
  const stable = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stable.buffer);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function processVerifiedFirmArCallback(input: {
  payload: unknown;
  store: FirmArVerifiedReceiptStore;
  verifyPades: IndependentPadesVerifier;
}): Promise<{ certificateId: string; signedPdfSha256: string; status: 'signed' }> {
  const { token } = parseFirmArCallback(input.payload);
  const tokenHash = await hashFirmArToken(token);
  const pending = await input.store.findByTokenHash(tokenHash);
  if (pending?.status !== 'awaiting_doctor_authorization') {
    throw new Error('firmar_callback_not_pending');
  }

  // Compare the exact immutable source file against the hash reserved in DB.
  const source = await input.store.readFrozenSource(pending.originalPdfPath);
  if (await digestSha256(source) !== pending.draftPdfSha256) {
    throw new Error('firmar_source_pdf_integrity_mismatch');
  }

  // verifyPades must verify actual PDF CMS signatures, Argentine trust
  // anchors, revocation, signer CUIL, authorized document and signing time.
  // It MUST NOT be a JSON flag check, PDF marker check, or image comparison.
  const evidence = await validateFirmArSignedDocument(
    input.payload, pending, input.verifyPades,
  );

  // Private bucket with upsert=false. Public reads must still require
  // verified DB status and the recorded matching SHA-256.
  const path = await input.store.persistSignedPdf(pending.certificateId, evidence.signedPdf);
  if (path !== `certificates/signed/${pending.certificateId}.pdf`) {
    throw new Error('firmar_unexpected_signed_storage_path');
  }
  const committed = await input.store.finalizeVerifiedDocument(pending.id, {
    signedPdfSha256: evidence.signedPdfSha256,
    signedPdfPath: path,
    signedAt: evidence.signedAt,
    fingerprintSha256: evidence.fingerprintSha256,
  });
  if (!committed) throw new Error('firmar_signature_finalization_failed');
  return {
    certificateId: pending.certificateId,
    signedPdfSha256: evidence.signedPdfSha256,
    status: 'signed',
  };
}
