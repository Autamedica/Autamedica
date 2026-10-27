import type { IDigitalSignatureService, SignerIdentity } from '@autamedica/prescriptions';

/** A signature image or a self-signed X.509 certificate cannot pass this gate. */
function comparableName(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\b(dr|dra|medico|medica)\b\.?/g, '')
    .replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}

export async function signAndVerifyMedicalCertificatePdf(input: {
  pdfBytes: Uint8Array;
  signer: SignerIdentity;
  provider: IDigitalSignatureService;
}): Promise<{
  signedPdf: Uint8Array;
  sha256: string;
  verifiedAt: string;
  fingerprint: string;
}> {
  if (!input.signer.matriculaNumber.trim() || comparableName(input.signer.fullName).length < 5) {
    throw new Error('certificate_signer_identity_incomplete');
  }
  const signed = await input.provider.signPdf(input.pdfBytes, input.signer);
  if (!signed.signedPdfBuffer || signed.signedPdfBuffer.length < 300 || !signed.certificateFingerprint) {
    throw new Error('certificate_signing_incomplete');
  }

  // Verify the actual SIGNED bytes with the external provider, not local
  // metadata. Do not mark the record signed on any failed verification.
  const verification = await input.provider.verifySignature(signed.signedPdfBuffer);
  if (!verification.isValid ||
      !verification.signerName ||
      comparableName(verification.signerName) !== comparableName(input.signer.fullName) ||
      !verification.certificateIssuer ||
      !verification.signedAt ||
      Number.isNaN(Date.parse(verification.signedAt))) {
    throw new Error('certificate_signature_not_verified');
  }

  const signedTime = Date.parse(verification.signedAt);
  if (Math.abs(Date.now() - signedTime) > 10 * 60_000) {
    throw new Error('certificate_signature_timestamp_out_of_range');
  }

  const pdfBytes = new Uint8Array(signed.signedPdfBuffer);
  const digest = await crypto.subtle.digest('SHA-256', pdfBytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map(v => v.toString(16).padStart(2, '0')).join('');
  return {
    signedPdf: pdfBytes,
    sha256,
    verifiedAt: new Date().toISOString(),
    fingerprint: signed.certificateFingerprint,
  };
}
