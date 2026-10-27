import { describe, expect, it, vi } from 'vitest';
import { encodePdfForFirmAr, FirmArClient, normalizeDoctorCuil } from './firmar-client';

const config = {
  raBaseUrl: 'https://ra.firmar.gob.ar/',
  signerBaseUrl: 'https://firmar.gob.ar/',
  apiUser: 'sample-user',
  apiSecret: 'sample-secret',
  allowedRedirectOrigins: ['https://www.autamedica.com'],
};
const request = {
  doctorCuil: '20-12345678-6',
  pdf: new TextEncoder().encode('%PDF-1.7\n% demo only'),
  requestToken: 'abcdefghijklmnopqrstuvwx12345678',
  redirectUrl: 'https://www.autamedica.com/doctors/certificates',
};

describe('FirmAR session client (offline protocol tests only)', () => {
  it('validates CUIL checksum and PDF before sending anything', () => {
    expect(normalizeDoctorCuil(request.doctorCuil)).toBe('20123456786');
    expect(() => normalizeDoctorCuil('20-12345678-9')).toThrow();
    expect(() => encodePdfForFirmAr(new TextEncoder().encode('not a pdf'))).toThrow();
  });

  it('requests RA access token and creates an authorization URL on the trusted host', async () => {
    const fetchMock = vi.fn(async (url: URL | string | Request, init?: RequestInit) => {
      if (String(url).includes('oauth/token')) {
        expect(init?.headers).toEqual(expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }));
        return new Response(JSON.stringify({ access_token: 'test-only-token' }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body));
      expect(body.cuil).toBe('20123456786');
      expect(body.type).toBe('PDF');
      expect(body.metadata.token).toBe(request.requestToken);
      expect(body.documento).toBe(btoa('%PDF-1.7\n% demo only'));
      return new Response(null, { status: 200, headers: { Location: '/api/signatures/sample-session' } });
    });
    const result = await new FirmArClient(config, fetchMock as typeof fetch).initiate(request);
    expect(result.authorizationUrl).toBe('https://firmar.gob.ar/api/signatures/sample-session');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('prevents malicious browser redirects and malicious authorization URLs', async () => {
    const neverCalled = vi.fn();
    await expect(new FirmArClient(config, neverCalled as typeof fetch).initiate({
      ...request, redirectUrl: 'https://www.autamedica.com.evil.example/return',
    })).rejects.toThrow('firmar_unapproved_return_origin');
    expect(neverCalled).not.toHaveBeenCalled();

    const malicious = vi.fn(async (url: URL | string | Request) =>
      String(url).includes('oauth/token')
        ? new Response(JSON.stringify({ access_token: 'sample' }), { status: 200 })
        : new Response(null, { status: 200, headers: { Location: 'https://evil.example/sign' } }));
    await expect(new FirmArClient(config, malicious as typeof fetch).initiate(request))
      .rejects.toThrow('firmar_untrusted_authorization_origin');
  });

  it('refuses missing credentials and plain HTTP endpoints', () => {
    expect(() => new FirmArClient({ ...config, apiSecret: '' })).toThrow();
    expect(() => new FirmArClient({ ...config, signerBaseUrl: 'http://firmar.gob.ar' })).toThrow();
  });
});
