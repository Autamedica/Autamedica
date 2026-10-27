import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  DOCTOR_ROLES: ['doctor'],
  withAuthRole: vi.fn(async () => ({ user: { id: 'server-authenticated-doctor' } })),
  isAuthed: vi.fn(() => true),
}));

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => {
    throw new Error('no database access expected until PFDR approval');
  }),
}));

import { POST } from './firmar';

const sampleCertificateId = '00000000-0000-4000-8000-000000000001';

describe('FirmAR physician API release gates', () => {
  it('refuses a missing or malformed certificate ID', async () => {
    const response = await POST({
      params: { id: '../other-doctor' },
      locals: {},
      request: new Request('https://www.autamedica.com/api/doctors/certificates/x/firmar', { method: 'POST' }),
    } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(400);
  });

  it('cannot touch medical data or request a signature without official approval', async () => {
    const response = await POST({
      params: { id: sampleCertificateId },
      locals: {
        runtime: { env: { FIRMAR_ENABLED: 'false', FIRMAR_INTEGRATION_APPROVED: 'false' } },
      },
      request: new Request('https://www.autamedica.com/api/doctors/certificates/' + sampleCertificateId + '/firmar', { method: 'POST', headers: { Origin: 'https://www.autamedica.com' } }),
    } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('firmar_integration_pending_authorization');
  });

  it('refuses CSRF attempts from a foreign origin even before contacting PFDR', async () => {
    const response = await POST({
      params: { id: sampleCertificateId },
      locals: { runtime: { env: { FIRMAR_ENABLED: 'true', FIRMAR_INTEGRATION_APPROVED: 'true' } } },
      request: new Request('https://www.autamedica.com/api/doctors/certificates/' + sampleCertificateId + '/firmar', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      }),
    } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(403);
  });

  it('rejects initiation with missing credentials even if both flags are set', async () => {
    const response = await POST({
      params: { id: sampleCertificateId },
      locals: {
        runtime: {
          env: {
            FIRMAR_ENABLED: 'true',
            FIRMAR_INTEGRATION_APPROVED: 'true',
            FIRMAR_API_USER: '',
            FIRMAR_API_SECRET: '',
            FIRMAR_BASE_URL: 'https://tst.firmar.gob.ar',
          },
        },
      },
      request: new Request('https://www.autamedica.com/api/doctors/certificates/' + sampleCertificateId + '/firmar', { method: 'POST', headers: { Origin: 'https://www.autamedica.com' } }),
    } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.error?.message).toBe('firmar_credentials_not_configured');
  });
});
