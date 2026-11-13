/**
 * Backend-only adapter to an isolated PAdES/CMS validator controlled by
 * AutaMedica. This file does NOT enable the FirmAR production callback.
 * Never trust a JSON "signed: true" from FirmAR or the browser.
 */
import type { PendingFirmArRequest, PadesVerificationEvidence } from './firmar-callback';

export interface IndependentPadesConfig {
  endpoint: string;
  serviceToken: string;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function encodeBase64(bytes: Uint8Array): string {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(value);
}

function permittedEndpoint(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/verify-pades' ||
      !url.hostname.endsWith('.autamedica.com')) {
    throw new Error('firmar_pades_endpoint_not_allowed');
  }
  return url.href;
}

export function createFirmArIndependentPadesVerifier(
  config: IndependentPadesConfig,
  fetcher: typeof fetch = fetch,
): (
  signedPdf: Uint8Array,
  expected: Pick<PendingFirmArRequest, 'doctorCuil' | 'draftPdfSha256'>,
  originalPdf: Uint8Array,
) => Promise<PadesVerificationEvidence> {
  const endpoint = permittedEndpoint(config.endpoint);
  if (config.serviceToken.length < 32) throw new Error('firmar_pades_service_token_missing');

  return async (signedPdf, expected, originalPdf) => {
    if (signedPdf.byteLength < 5 || signedPdf.byteLength > 8 * 1024 * 1024 ||
        originalPdf.byteLength < 5 || originalPdf.byteLength > 8 * 1024 * 1024) {
      throw new Error('firmar_pades_pdf_size_invalid');
    }
    const [originalHash, signedHash] = await Promise.all([
      sha256Hex(originalPdf),
      sha256Hex(signedPdf),
    ]);
    if (originalHash !== expected.draftPdfSha256 ||
        signedPdf.byteLength <= originalPdf.byteLength ||
        originalPdf.some((b, i) => b !== signedPdf[i])) {
      throw new Error('firmar_pades_source_integrity_mismatch');
    }

    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-store',
        Authorization: 'Bearer ' + config.serviceToken,
      },
      body: JSON.stringify({
        originalPdfBase64: encodeBase64(originalPdf),
        signedPdfBase64: encodeBase64(signedPdf),
        expectedOriginalSha256: originalHash,
        expectedSignerCuil: expected.doctorCuil,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error('firmar_pades_independent_verification_failed');

    const evidence: unknown = await response.json();
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      throw new Error('firmar_pades_invalid_response');
    }
    const data = evidence as Record<string, unknown>;
    if (data.signedPdfSha256 !== signedHash ||
        data.originalPdfSha256 !== originalHash ||
        data.signerCuil !== expected.doctorCuil ||
        data.cryptographicallyValid !== true ||
        data.trustedArgentineIssuer !== true ||
        data.certificateNotRevoked !== true ||
        data.certificateNotExpired !== true ||
        data.matchedOriginalDocument !== true ||
        typeof data.certificateFingerprintSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(data.certificateFingerprintSha256) ||
        typeof data.signedAt !== 'string' ||
        !Number.isFinite(Date.parse(data.signedAt))) {
      throw new Error('firmar_pades_evidence_unverified');
    }
    return {
      cryptographicallyValid: true,
      trustedArgentineIssuer: true,
      certificateNotRevoked: true,
      certificateNotExpired: true,
      matchedOriginalDocument: true,
      signerCuil: expected.doctorCuil,
      certificateFingerprintSha256: data.certificateFingerprintSha256,
      signedAt: data.signedAt,
    };
  };
}
