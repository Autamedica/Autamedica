import { describe, expect, it, vi } from 'vitest';
import { hashFirmArToken } from './firmar-callback';
import { processVerifiedFirmArCallback } from './firmar-verified-callback-processor';
import type { FirmArVerifiedReceiptStore } from './firmar-verified-callback-processor';

const token = '0123456789abcdef'.repeat(4);
const source = new TextEncoder().encode('%PDF-1.7\nUnsigned snapshot');
const signed = new Uint8Array([...source, ...new TextEncoder().encode('\\n% incremental mock PAdES update')]);
const certificateId = '00000000-0000-4000-8000-000000000001';
const fp = 'a'.repeat(64);
async function hexSha(bytes: Uint8Array) {
  const result = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(result)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const payload = {
  documento: btoa(String.fromCharCode(...signed)),
  status: {},
  metadata: [{ tipo: 'firmar', token }],
};
const verification = {
  cryptographicallyValid: true,
  trustedArgentineIssuer: true,
  certificateNotRevoked: true,
  certificateNotExpired: true,
  signerCuil: '20123456786',
  certificateFingerprintSha256: fp,
  matchedOriginalDocument: true,
  signedAt: new Date().toISOString(),
};
async function fixture() {
  const record = {
    id: '00000000-0000-4000-8000-000000000002',
    certificateId,
    doctorCuil: '20123456786',
    tokenHash: await hashFirmArToken(token),
    draftPdfSha256: await hexSha(source),
    originalPdfPath: `certificates/firmar/source/${certificateId}/${await hashFirmArToken(token)}.pdf`,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    status: 'awaiting_doctor_authorization' as const,
  };
  const store: FirmArVerifiedReceiptStore = {
    findByTokenHash: vi.fn(async () => record),
    readFrozenSource: vi.fn(async () => source),
    persistSignedPdf: vi.fn(async () => `certificates/signed/${certificateId}.pdf`),
    finalizeVerifiedDocument: vi.fn(async () => true),
  };
  return { store, record };
}
describe('FirmAR receipt pipeline (mocked PAdES verifier only)', () => {
  it('checks frozen source, validates digital evidence and finalizes in DB', async () => {
    const { store } = await fixture();
    const verify = vi.fn(async () => verification);
    const result = await processVerifiedFirmArCallback({
      payload, store, verifyPades: verify,
    });
    expect(result.status).toBe('signed');
    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith(signed, expect.objectContaining({ doctorCuil: '20123456786' }), source);
    expect(store.persistSignedPdf).toHaveBeenCalledOnce();
    expect(store.finalizeVerifiedDocument).toHaveBeenCalledOnce();
  });

  it('refuses changed original bytes without persisting the received document', async () => {
    const { store } = await fixture();
    vi.mocked(store.readFrozenSource).mockResolvedValue(new TextEncoder().encode('%PDF-tampered'));
    const verify = vi.fn(async () => verification);
    await expect(processVerifiedFirmArCallback({ payload, store, verifyPades: verify }))
      .rejects.toThrow('firmar_source_pdf_integrity_mismatch');
    expect(verify).not.toHaveBeenCalled();
    expect(store.persistSignedPdf).not.toHaveBeenCalled();
  });

  it('refuses invalid PAdES proof and never transitions to signed', async () => {
    const { store } = await fixture();
    await expect(processVerifiedFirmArCallback({
      payload, store, verifyPades: async () => ({ ...verification, certificateNotRevoked: false }),
    })).rejects.toThrow('firmar_unverified_signed_document');
    expect(store.persistSignedPdf).not.toHaveBeenCalled();
    expect(store.finalizeVerifiedDocument).not.toHaveBeenCalled();
  });


  it('refuses a signed PDF that rewrites the doctor-reviewed clinical snapshot', async () => {
    const { store } = await fixture();
    const rewritten = new TextEncoder().encode('%PDF-1.7\\nEntirely different document');
    const replacement = { ...payload, documento: btoa(String.fromCharCode(...rewritten)) };
    const verifier = vi.fn(async () => verification);
    await expect(processVerifiedFirmArCallback({ payload: replacement, store, verifyPades: verifier }))
      .rejects.toThrow('firmar_signed_pdf_source_revision_mismatch');
    expect(verifier).not.toHaveBeenCalled();
    expect(store.persistSignedPdf).not.toHaveBeenCalled();
    expect(store.finalizeVerifiedDocument).not.toHaveBeenCalled();
  });

  it('refuses consumed or unknown signing tokens', async () => {
    const { store } = await fixture();
    vi.mocked(store.findByTokenHash).mockResolvedValue(null);
    await expect(processVerifiedFirmArCallback({
      payload, store, verifyPades: async () => verification,
    })).rejects.toThrow('firmar_callback_not_pending');
  });
});
