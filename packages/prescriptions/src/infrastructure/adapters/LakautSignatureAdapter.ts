/**
 * LakautSignatureAdapter — firma digital de valor probatorio pleno (Ley 25.506 AR).
 *
 * Reemplaza X509SignatureService cuando el médico tiene un certificado emitido
 * por una AC acreditada (Lakaut, Encode, Digicert AR, etc).
 *
 * Docs Lakaut API (v1): https://api.lakaut.com/docs
 *   POST /sign/pdf       → firma un PDF en server (PAdES-B-LTA por default)
 *   POST /verify/pdf     → verifica firma y retorna metadatos del signer
 */

import { createHash } from 'node:crypto';
import type {
  IDigitalSignatureService,
  SignerIdentity,
  SignedPdfResult,
  VerificationResult,
} from '../../domain/signature.ports';
import { logger } from '@autamedica/shared';

export interface LakautConfig {
  baseUrl: string;
  apiToken: string;
  defaultSignatureProfile?: 'PAdES-B-B' | 'PAdES-B-T' | 'PAdES-B-LT' | 'PAdES-B-LTA';
  requestTimeoutMs?: number;
}

interface LakautSignResponse {
  signedPdfBase64: string;
  signatureHash: string;
  certificateFingerprint: string;
  signedAt: string;
}

interface LakautVerifyResponse {
  valid: boolean;
  signerName: string;
  signedAt: string;
  issuedBy: string;
  revoked: boolean;
}

export class LakautSignatureAdapter implements IDigitalSignatureService {
  constructor(private readonly config: LakautConfig) {
    if (!config.apiToken) throw new Error('Lakaut apiToken required');
    if (!config.baseUrl) throw new Error('Lakaut baseUrl required');
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs ?? 30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Lakaut ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async signPdf(pdfBytes: Uint8Array, signerInfo: SignerIdentity): Promise<SignedPdfResult> {
    const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
    logger.info(
      `[LakautSignatureAdapter] signing PDF hash=${pdfHash.slice(0, 16)}… signer=${signerInfo.fullName} matricula=${signerInfo.matriculaType}-${signerInfo.matriculaNumber}`,
    );

    const payload = {
      pdfBase64: Buffer.from(pdfBytes).toString('base64'),
      signerReference: `${signerInfo.matriculaType}-${signerInfo.matriculaNumber}`,
      signerSubject: [
        `CN=${signerInfo.fullName}`,
        `O=${signerInfo.organizationName ?? 'AutaMedica'}`,
        `OU=${signerInfo.matriculaType}-${signerInfo.matriculaNumber}`,
        'C=AR',
      ].join(', '),
      signatureProfile: this.config.defaultSignatureProfile ?? 'PAdES-B-LTA',
    };

    const response = await this.call<LakautSignResponse>('/sign/pdf', payload);

    return {
      signedPdfBuffer: Buffer.from(response.signedPdfBase64, 'base64'),
      signatureHash: response.signatureHash,
      certificateFingerprint: response.certificateFingerprint,
      signedAt: response.signedAt,
    };
  }

  async verifySignature(pdfBytes: Uint8Array): Promise<VerificationResult> {
    const payload = {
      pdfBase64: Buffer.from(pdfBytes).toString('base64'),
    };

    try {
      const response = await this.call<LakautVerifyResponse>('/verify/pdf', payload);
      return {
        isValid: response.valid && !response.revoked,
        signerName: response.signerName,
        signedAt: response.signedAt,
        certificateIssuer: response.issuedBy,
      };
    } catch (err) {
      logger.error('[LakautSignatureAdapter] verify failed', err);
      return { isValid: false };
    }
  }
}
