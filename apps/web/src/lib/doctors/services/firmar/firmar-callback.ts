/**
 * FirmAR callback validation contract.
 *
 * IMPORTANT: This helper does not verify PAdES itself. A caller must supply
 * a trustworthy independent PDF verifier (trusted cert chain + OCSP/CRL +
 * signer CUIL + correlation with the frozen source PDF). No production POST
 * route may call this helper until those safeguards and atomic persistence exist.
 */
export interface PendingFirmArRequest {
  certificateId: string;
  doctorCuil: string;
  tokenHash: string;
  draftPdfSha256: string;
  expiresAt: string;
  status: 'pending' | 'awaiting_doctor_authorization';
}

export interface PadesVerificationEvidence {
  cryptographicallyValid: boolean;
  trustedArgentineIssuer: boolean;
  certificateNotRevoked: boolean;
  certificateNotExpired: boolean;
  signerCuil: string;
  certificateFingerprintSha256: string;
  matchedOriginalDocument: boolean;
  signedAt: string;
}

export type IndependentPadesVerifier = (
  signedPdf: Uint8Array,
  original: Pick<PendingFirmArRequest, 'doctorCuil' | 'draftPdfSha256'>,
) => Promise<PadesVerificationEvidence>;

async function sha256(value: Uint8Array): Promise<string> {
  const bytes = Uint8Array.from(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}

export async function hashFirmArToken(token: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(token)) throw new Error('firmar_invalid_token');
  return sha256(new TextEncoder().encode(token));
}

function sameHash(a: string, b: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(a) || !/^[a-f\d]{64}$/i.test(b)) return false;
  let mismatch = 0;
  for (let i = 0; i < 64; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function parseFirmArCallback(payload: unknown): { token: string; pdf: Uint8Array } {
  if (!payload || typeof payload !== 'object') throw new Error('firmar_callback_invalid');
  const data = payload as Record<string, unknown>;
  // SIU's published callback sends "status": {}. Neither its presence nor
  // an asserted success flag proves authenticity; full independent PAdES
  // validation below is the real trust gate.
  const callbackStatus = data.status;
  if (callbackStatus !== true &&
      (!callbackStatus || typeof callbackStatus !== 'object' ||
       Array.isArray(callbackStatus) ||
       (callbackStatus as Record<string, unknown>).success === false)) {
    throw new Error('firmar_callback_unsuccessful');
  }

  const metadata = Array.isArray(data.metadata)
    ? data.metadata.find(v => v && typeof v === 'object' && (v as Record<string, unknown>).tipo === 'firmar')
    : data.metadata;
  const token = (metadata as Record<string, unknown> | undefined)?.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22,128}$/.test(token)) {
    throw new Error('firmar_callback_token_missing');
  }
  const encoded = data.documento;
  if (typeof encoded !== 'string' || !encoded || encoded.length > 12 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('firmar_callback_pdf_invalid');
  }
  const pdf = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  if (pdf.byteLength < 5 || pdf.byteLength > 8 * 1024 * 1024 ||
      String.fromCharCode(...pdf.slice(0, 5)) !== '%PDF-') {
    throw new Error('firmar_callback_pdf_invalid');
  }
  return { token, pdf };
}

export async function validateFirmArSignedDocument(
  payload: unknown,
  pending: PendingFirmArRequest,
  verify: IndependentPadesVerifier,
): Promise<{ certificateId: string; signedPdf: Uint8Array; signedPdfSha256: string; signedAt: string; fingerprintSha256: string }> {
  const { token, pdf } = parseFirmArCallback(payload);
  if (!['pending', 'awaiting_doctor_authorization'].includes(pending.status) ||
      !sameHash(await hashFirmArToken(token), pending.tokenHash)) {
    throw new Error('firmar_unknown_or_replayed_token');
  }
  if (!Number.isFinite(Date.parse(pending.expiresAt)) || Date.parse(pending.expiresAt) <= Date.now()) {
    throw new Error('firmar_callback_expired');
  }
  const evidence = await verify(pdf, pending);
  if (!evidence.cryptographicallyValid || !evidence.trustedArgentineIssuer ||
      !evidence.certificateNotRevoked || !evidence.certificateNotExpired ||
      !evidence.matchedOriginalDocument ||
      !/^[a-f0-9]{64}$/.test(evidence.certificateFingerprintSha256) ||
      evidence.signerCuil.replace(/\D/g, '') !== pending.doctorCuil.replace(/\D/g, '') ||
      !evidence.signedAt || !Number.isFinite(Date.parse(evidence.signedAt))) {
    throw new Error('firmar_unverified_signed_document');
  }
  // A separate DB transaction must claim the token exactly once, record its
  // consumption, persist the signed file hash and update certificate status.
  return {
    certificateId: pending.certificateId,
    signedPdf: pdf,
    signedPdfSha256: await sha256(pdf),
    signedAt: evidence.signedAt,
    fingerprintSha256: evidence.certificateFingerprintSha256,
  };
}
