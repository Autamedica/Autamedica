import { describe, expect, it, vi } from 'vitest';
import { hashFirmArToken, validateFirmArSignedDocument } from './firmar-callback';

const token = 'abcdefghijklmnopqrstuvwx12345678';
const originalPdf = '%PDF-1.7\n% simulated signed PDF';
const payload = {
  status: { success: true },
  metadata: [{ tipo: 'firmar', token }],
  documento: btoa(originalPdf),
};
const evidence = {
  cryptographicallyValid: true,
  trustedArgentineIssuer: true,
  certificateNotRevoked: true,
  certificateNotExpired: true,
  signerCuil: '20123456786',
  certificateFingerprintSha256: 'a'.repeat(64),
  matchedOriginalDocument: true,
  signedAt: new Date().toISOString(),
};

async function pending() {
  return {
    certificateId: 'test-certificate-uuid',
    doctorCuil: '20123456786',
    tokenHash: await hashFirmArToken(token),
    draftPdfSha256: 'a'.repeat(64),
    status: 'pending' as const,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  };
}

describe('FirmAR callback security (mock verifier; not official signature tests)', () => {
  it('accepts bytes only after independent verification evidence is supplied', async () => {
    const verify = vi.fn(async () => evidence);
    const result = await validateFirmArSignedDocument(payload, await pending(), verify);
    expect(result.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.signedPdfSha256).toHaveLength(64);
    expect(result.certificateId).toBe('test-certificate-uuid');
    expect(verify).toHaveBeenCalledOnce();
  });

  it('handles SIU FirmAR callbacks with an empty status object while still verifying the PDF', async () => {
    const verifier = vi.fn(async () => evidence);
    const signed = await validateFirmArSignedDocument({ ...payload, status: {} }, await pending(), verifier);
    expect(signed.signedPdfSha256).toHaveLength(64);
    expect(verifier).toHaveBeenCalledOnce();
  });

  it('rejects unverifiable signatures and signer substitution', async () => {
    for (const override of [
      { cryptographicallyValid: false },
      { trustedArgentineIssuer: false },
      { certificateNotRevoked: false },
      { certificateNotExpired: false },
      { matchedOriginalDocument: false },
      { signerCuil: '20123456787' },
      { certificateFingerprintSha256: 'invalid' },
    ]) {
      await expect(validateFirmArSignedDocument(
        payload, await pending(), async () => ({ ...evidence, ...override }),
      )).rejects.toThrow('firmar_unverified_signed_document');
    }
  });

  it('rejects expired requests, wrong tokens and unsigned callback claims', async () => {
    const p = await pending();
    await expect(validateFirmArSignedDocument(
      payload, { ...p, expiresAt: '2020-01-01T00:00:00.000Z' }, async () => evidence,
    )).rejects.toThrow('firmar_callback_expired');
    await expect(validateFirmArSignedDocument(
      { ...payload, metadata: [{ tipo: 'firmar', token: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' }] },
      p, async () => evidence,
    )).rejects.toThrow('firmar_unknown_or_replayed_token');
    await expect(validateFirmArSignedDocument(
      { ...payload, status: { success: false } }, p, async () => evidence,
    )).rejects.toThrow('firmar_callback_unsuccessful');
  });
});
