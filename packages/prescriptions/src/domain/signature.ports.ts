export interface SignerIdentity {
  fullName: string;
  matriculaNumber: string;
  matriculaType: 'MN' | 'MP';
  organizationName?: string;
}

export interface SignedPdfResult {
  signedPdfBuffer: Buffer;
  signatureHash: string;
  certificateFingerprint: string;
  signedAt: string;
}

export interface VerificationResult {
  isValid: boolean;
  signerName?: string;
  signedAt?: string;
  certificateIssuer?: string;
}

export interface IDigitalSignatureService {
  signPdf(pdfBytes: Uint8Array, signerInfo: SignerIdentity): Promise<SignedPdfResult>;
  verifySignature(pdfBytes: Uint8Array): Promise<VerificationResult>;
}
