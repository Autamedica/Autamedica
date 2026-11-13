import { describe, expect, it, vi } from 'vitest';
import type { IDigitalSignatureService } from '@autamedica/prescriptions';
import { signAndVerifyMedicalCertificatePdf } from './medical-certificate-signing.service';

const signer = { fullName: 'Maria Lopez', matriculaType: 'MP' as const, matriculaNumber: '1234' };
const sampleSigned = Buffer.alloc(400, 65);
const signedAt = new Date().toISOString();

function fakeProvider(overrides?: Partial<Awaited<ReturnType<IDigitalSignatureService['verifySignature']>>>): IDigitalSignatureService {
  return {
    signPdf: vi.fn().mockResolvedValue({
      signedPdfBuffer: sampleSigned,
      signatureHash: 'external-hash',
      certificateFingerprint: 'fingerprint-example',
      signedAt,
    }),
    verifySignature: vi.fn().mockResolvedValue({
      isValid: true,
      signerName: 'Maria Lopez',
      certificateIssuer: 'Verified CA',
      signedAt,
      ...overrides,
    }),
  };
}

describe('medical certificate trusted signature gate', () => {
  it('accepts independently verified signed bytes with matching signer identity', async () => {
    const provider = fakeProvider();
    const result = await signAndVerifyMedicalCertificatePdf({
      provider, signer, pdfBytes: new Uint8Array([1, 2, 3]),
    });
    expect(result.sha256).toHaveLength(64);
    expect(result.signedPdf.byteLength).toBe(400);
    expect(provider.verifySignature).toHaveBeenCalledWith(sampleSigned);
  });

  it('rejects identity substitution even if the provider says the signature is valid', async () => {
    await expect(signAndVerifyMedicalCertificatePdf({
      provider: fakeProvider({ signerName: 'Otro Medico' }), signer, pdfBytes: new Uint8Array([1]),
    })).rejects.toThrow('certificate_signature_not_verified');
  });

  it('rejects failed or incomplete signature validation', async () => {
    await expect(signAndVerifyMedicalCertificatePdf({
      provider: fakeProvider({ isValid: false }), signer, pdfBytes: new Uint8Array([1]),
    })).rejects.toThrow('certificate_signature_not_verified');
    await expect(signAndVerifyMedicalCertificatePdf({
      provider: fakeProvider({ certificateIssuer: undefined }), signer, pdfBytes: new Uint8Array([1]),
    })).rejects.toThrow('certificate_signature_not_verified');
  });
});
