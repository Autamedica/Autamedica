import { describe, expect, it, vi } from 'vitest';
import { FirmarRemoteClient } from './firmar-remote-client';

const PDF = new TextEncoder().encode('%PDF-1.7 test');
const token = 'c0ffeeabcd1234567890012345678901';
const config = {
  baseUrl: 'https://tst.firmar.gob.ar',
  apiUser: 'test-user',
  apiSecret: 'test-secret',
};

const request = {
  doctorCuil: '20123456786',
  requestToken: token,
  returnUrl: 'https://www.autamedica.com/doctors/certificates/return',
  pdfBytes: PDF,
};

function fakeFetch(location = '/api/signatures/example-document-01') {
  return vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'test-access-token',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(null, {
      status: 200, headers: { Location: location },
    }));
}

describe('FirmAR remote API client', () => {
  it('submits a PDF with CUIL, correlation metadata and OAuth authorization', async () => {
    const fetcher = fakeFetch();
    const client = new FirmarRemoteClient(config, fetcher);
    const result = await client.createSigningSession(request);
    expect(result).toEqual({
      authorizationUrl: 'https://tst.firmar.gob.ar/api/signatures/example-document-01',
      requestToken: token,
      status: 'awaiting_doctor_authorization',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [oauthUrl, oauthOptions] = fetcher.mock.calls[0];
    expect(String(oauthUrl)).toBe('https://tst.firmar.gob.ar/ra/oauth/token');
    expect(oauthOptions.body).toContain('grant_type=client_credentials');
    expect(oauthOptions.headers.Authorization).toMatch(/^Basic /);

    const [signUrl, signOptions] = fetcher.mock.calls[1];
    expect(String(signUrl)).toBe('https://tst.firmar.gob.ar/firmador/api/signatures');
    expect(signOptions.headers.Authorization).toBe('Bearer test-access-token');
    const payload = JSON.parse(signOptions.body);
    expect(payload.cuil).toBe(request.doctorCuil);
    expect(payload.type).toBe('PDF');
    expect(payload.metadata).toEqual({ tipo: 'firmar', token });
    expect(payload.urlRedirect).toBe(request.returnUrl);
    expect(atob(payload.documento)).toBe('%PDF-1.7 test');
  });

  it('does not call a remote host when the signer, PDF or token is invalid', async () => {
    const fetcher = fakeFetch();
    const client = new FirmarRemoteClient(config, fetcher);
    await expect(client.createSigningSession({ ...request, doctorCuil: 'invalid' }))
      .rejects.toThrow('firmar_doctor_cuil_invalid');
    await expect(client.createSigningSession({ ...request, doctorCuil: '20123456789' }))
      .rejects.toThrow('firmar_doctor_cuil_checksum_invalid');
    await expect(client.createSigningSession({ ...request, pdfBytes: new Uint8Array([1]) }))
      .rejects.toThrow('firmar_document_not_pdf');
    await expect(client.createSigningSession({ ...request, requestToken: 'guessable' }))
      .rejects.toThrow('firmar_request_token_invalid');
    await expect(client.createSigningSession({ ...request, returnUrl: 'https://evil.example/cb' }))
      .rejects.toThrow('firmar_return_url_not_allowed');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects redirects to foreign origins even when a signing service returns them', async () => {
    const client = new FirmarRemoteClient(config, fakeFetch('https://evil.example/signatures/123'));
    await expect(client.createSigningSession(request))
      .rejects.toThrow('firmar_authorization_url_untrusted');
  });

  it('rejects impersonation of the FirmAR API and missing credentials', () => {
    expect(() => new FirmarRemoteClient({ ...config, baseUrl: 'https://evil.example' }))
      .toThrow('firmar_origin_not_allowed');
    expect(() => new FirmarRemoteClient({ ...config, apiSecret: '' }))
      .toThrow('firmar_credentials_missing');
  });

  it('never treats a request for authorization as a signed document', async () => {
    const session = await new FirmarRemoteClient(config, fakeFetch()).createSigningSession(request);
    expect(session.status).not.toBe('signed');
    expect(session).not.toHaveProperty('signedPdf');
  });
});
