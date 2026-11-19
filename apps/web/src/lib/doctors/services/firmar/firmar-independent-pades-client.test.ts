import { describe, expect, it, vi } from 'vitest';
import { createFirmArIndependentPadesVerifier } from './firmar-independent-pades-client';

const original = new TextEncoder().encode('%PDF-1.7\nDoctor-approved clinical snapshot');
const signed = new Uint8Array([
  ...original, ...new TextEncoder().encode('\n% mock incremental signature data'),
]);
const expectedCuil = '20123456786';
const service = {
  endpoint: 'https://verifier.autamedica.com/verify-pades',
  serviceToken: 'a'.repeat(48),
};

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function fixtureResponse(overrides: Record<string, unknown> = {}) {
  return {
    cryptographicallyValid: true,
    trustedArgentineIssuer: true,
    certificateNotRevoked: true,
    certificateNotExpired: true,
    matchedOriginalDocument: true,
    signerCuil: expectedCuil,
    certificateFingerprintSha256: 'b'.repeat(64),
    signedAt: new Date().toISOString(),
    originalPdfSha256: await digest(original),
    signedPdfSha256: await digest(signed),
    ...overrides,
  };
}

describe('FirmAR isolated PAdES verifier adapter (mock transport)', () => {
  it('requires a dedicated HTTPS verifier endpoint and nonempty secret', () => {
    for (const endpoint of [
      'http://verifier.autamedica.com/verify-pades',
      'https://evil.example.com/verify-pades',
      'https://verifier.autamedica.com/admin',
      'https://user:secret@verifier.autamedica.com/verify-pades',
      'https://verifier.autamedica.com:8443/verify-pades',
    ]) {
      expect(() => createFirmArIndependentPadesVerifier({ ...service, endpoint }))
        .toThrow('firmar_pades_endpoint_not_allowed');
    }
    expect(() => createFirmArIndependentPadesVerifier({ ...service, serviceToken: 'short' }))
      .toThrow('firmar_pades_service_token_missing');
  });

  it('only accepts signed evidence matching original bytes, signer and hashes', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(await fixtureResponse()), { status: 200 }),
    );
    const verify = createFirmArIndependentPadesVerifier(service, fetcher as unknown as typeof fetch);
    const result = await verify(signed, {
      doctorCuil: expectedCuil, draftPdfSha256: await digest(original),
    }, original);
    expect(result.signerCuil).toBe(expectedCuil);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe(service.endpoint);
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'POST', redirect: 'error',
    }));
  });

  it('rejects a rewritten clinical snapshot before sending confidential bytes', async () => {
    const fetcher = vi.fn(async () => new Response('{}'));
    const verify = createFirmArIndependentPadesVerifier(service, fetcher as unknown as typeof fetch);
    const replacement = new TextEncoder().encode('%PDF-1.7\nOther patient');
    await expect(verify(replacement, {
      doctorCuil: expectedCuil, draftPdfSha256: await digest(original),
    }, original)).rejects.toThrow('firmar_pades_source_integrity_mismatch');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects fake success, signer substitutions and altered hashes', async () => {
    for (const override of [
      { cryptographicallyValid: false },
      { signerCuil: '20123456787' },
      { signedPdfSha256: '0'.repeat(64) },
      { originalPdfSha256: '0'.repeat(64) },
      { matchedOriginalDocument: false },
      { certificateNotRevoked: false },
    ]) {
      const fetcher = vi.fn(async () =>
        new Response(JSON.stringify(await fixtureResponse(override)), { status: 200 }),
      );
      const verify = createFirmArIndependentPadesVerifier(service, fetcher as unknown as typeof fetch);
      await expect(verify(signed, {
        doctorCuil: expectedCuil, draftPdfSha256: await digest(original),
      }, original)).rejects.toThrow('firmar_pades_evidence_unverified');
    }
  });

  it('fails closed on verifier outage', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 }));
    const verify = createFirmArIndependentPadesVerifier(service, fetcher as unknown as typeof fetch);
    await expect(verify(signed, {
      doctorCuil: expectedCuil, draftPdfSha256: await digest(original),
    }, original)).rejects.toThrow('firmar_pades_independent_verification_failed');
  });
});
