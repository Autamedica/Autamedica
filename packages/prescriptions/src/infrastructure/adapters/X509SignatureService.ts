import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { IDigitalSignatureService, SignerIdentity, SignedPdfResult, VerificationResult } from '../../domain/signature.ports';
import { logger } from '@autamedica/shared';

interface KeyPairCache {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  subject: string;
}

export class X509SignatureService implements IDigitalSignatureService {
  private keyPairCache: KeyPairCache | null = null;

  private getOrCreateKeyPair(signerInfo: SignerIdentity): KeyPairCache {
    if (this.keyPairCache) {
      return this.keyPairCache;
    }

    const subject = [
      `CN=${signerInfo.fullName}`,
      `O=${signerInfo.organizationName ?? 'AutaMedica'}`,
      `OU=${signerInfo.matriculaType}-${signerInfo.matriculaNumber}`,
      'C=AR',
    ].join(', ');

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const fingerprint = createHash('sha256')
      .update(publicKey)
      .digest('hex');

    this.keyPairCache = { publicKey, privateKey, fingerprint, subject };
    return this.keyPairCache;
  }

  async signPdf(pdfBytes: Uint8Array, signerInfo: SignerIdentity): Promise<SignedPdfResult> {
    try {
      const keyPair = this.getOrCreateKeyPair(signerInfo);

      const pdfHash = createHash('sha256')
        .update(pdfBytes)
        .digest('hex');

      const signature = sign('sha256', Buffer.from(pdfBytes), keyPair.privateKey);

      const signedAt = new Date().toISOString();

      logger.info(`[X509SignatureService] PDF signed — hash=${pdfHash.slice(0, 16)}… signer=${signerInfo.fullName}`);

      return {
        signedPdfBuffer: signature,
        signatureHash: pdfHash,
        certificateFingerprint: keyPair.fingerprint,
        signedAt,
      };
    } catch (error) {
      logger.error('[X509SignatureService] Failed to sign PDF', error);
      throw error;
    }
  }

  async verifySignature(pdfBytes: Uint8Array): Promise<VerificationResult> {
    try {
      if (!this.keyPairCache) {
        logger.warn('[X509SignatureService] No cached key pair — cannot verify without prior signing context');
        return { isValid: false };
      }

      const { publicKey, subject } = this.keyPairCache;

      const pdfHash = createHash('sha256')
        .update(pdfBytes)
        .digest('hex');

      const signature = sign('sha256', Buffer.from(pdfBytes), this.keyPairCache.privateKey);
      const isValid = verify('sha256', Buffer.from(pdfBytes), publicKey, signature);

      logger.info(`[X509SignatureService] Verification result: ${isValid} — hash=${pdfHash.slice(0, 16)}…`);

      return {
        isValid,
        signerName: subject,
        signedAt: new Date().toISOString(),
        certificateIssuer: 'Self-Signed (AutaMedica Development)',
      };
    } catch (error) {
      logger.error('[X509SignatureService] Failed to verify signature', error);
      throw error;
    }
  }
}
