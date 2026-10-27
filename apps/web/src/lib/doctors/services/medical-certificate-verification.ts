/**
 * Public medical-certificate verification gate.
 *
 * An internal reference / QR alone is not evidence of a legally issued
 * certificate or of a verified cryptographic signature.
 * Signature evidence must be recorded by trusted server-side issuance.
 */
export interface MedicalCertificateVerificationEvidence {
  status: string;
  signed_pdf_url: string | null;
  signature_verified_at: string | null;
  signature_hash: string | null;
  signature_method: string | null;
}

export function isMedicalCertificatePubliclyVerifiable(
  cert: MedicalCertificateVerificationEvidence,
): boolean {
  return (
    cert.status === "signed" &&
    Boolean(cert.signed_pdf_url?.trim()) &&
    Boolean(cert.signature_verified_at) &&
    Boolean(cert.signature_hash?.trim()) &&
    (cert.signature_method === "ac_external" || cert.signature_method === "electronic_verified")
  );
}
