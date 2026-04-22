/**
 * PDF Digital Signature Service (PAdES)
 *
 * Signs PDF documents with a PKCS#12 certificate using the PAdES standard.
 * When a signed PDF is opened in Adobe Reader, it shows the signature
 * validation status (valid/invalid/unknown signer).
 *
 * Phase 2: Self-signed certificates (yellow warning in Adobe).
 * Phase 3: AC-issued certificates (green checkmark in Adobe).
 *
 * NOTE: All @signpdf dependencies are dynamically imported to avoid
 * bundling Node.js-only code into the Cloudflare Workers runtime.
 */
import { logger } from '@autamedica/shared';

export interface SignPdfInput {
  pdfBuffer: Uint8Array;
  p12Buffer: Buffer;
  password: string;
  signerName?: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
}

export interface SignPdfResult {
  signedPdfBuffer: Uint8Array;
  signatureHash: string;
}

/**
 * Signs a PDF buffer using a PKCS#12 certificate.
 *
 * The resulting PDF contains a PAdES-compatible digital signature
 * that can be verified by any compliant PDF viewer.
 */
export async function signPdfWithP12(input: SignPdfInput): Promise<SignPdfResult> {
  const {
    pdfBuffer,
    p12Buffer,
    password,
    signerName = 'AutaMedica',
    reason = 'Prescripción médica electrónica - Ley 27.553',
    location = 'Argentina',
    contactInfo = 'soporte@autamedica.com',
  } = input;

  try {
    // Dynamic imports to avoid Cloudflare Workers bundling issues
    const { plainAddPlaceholder } = await import('@signpdf/placeholder-plain');
    const { P12Signer } = await import('@signpdf/signer-p12');
    const { SignPdf } = await import('@signpdf/signpdf');

    // 1. Add signature placeholder to the PDF
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: Buffer.from(pdfBuffer),
      reason,
      location,
      contactInfo,
      name: signerName,
      signatureLength: 8192,
    });

    // 2. Create signer with P12 credentials
    const signer = new P12Signer(p12Buffer, { passphrase: password });

    // 3. Sign the PDF
    const signPdf = new SignPdf();
    const signedBuffer = await signPdf.sign(pdfWithPlaceholder, signer);

    // 4. Compute hash of the signed document
    const { createHash } = await import('crypto');
    const signatureHash = createHash('sha256')
      .update(signedBuffer)
      .digest('hex');

    logger.info('[pdf-signer] PDF signed successfully', {
      originalSize: pdfBuffer.length,
      signedSize: signedBuffer.length,
      signatureHash,
    });

    return {
      signedPdfBuffer: new Uint8Array(signedBuffer),
      signatureHash,
    };
  } catch (error) {
    logger.error('[pdf-signer] Signing failed', error);
    throw new Error(`PDF signing failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}
