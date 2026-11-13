import { describe, expect, it, vi } from 'vitest';
import { prepareFirmArSigningSession } from './firmar-session-orchestrator';
import type {
  FirmArDoctorEnrollment, FirmArEligibleDraft, FirmArSessionStore, FirmArSigningGateway,
} from './firmar-session-orchestrator';

const draft: FirmArEligibleDraft = {
  certificateId: 'cert-test-1',
  doctorId: 'doctor-test-1',
  countryCode: 'AR',
  status: 'draft',
  pdfBytes: new TextEncoder().encode('%PDF-1.7\n% fixed clinical snapshot'),
};
const enrollment: FirmArDoctorEnrollment = {
  doctorId: 'doctor-test-1',
  cuil: '20123456786',
  verificationStatus: 'verified',
};
const response = {
  authorizationUrl: 'https://tst.firmar.gob.ar/api/signatures/example-document-01',
  requestToken: '',
  status: 'awaiting_doctor_authorization' as const,
};

function setup() {
  const store: FirmArSessionStore = {
    reserveAndFreeze: vi.fn(async () => true),
    markAwaitingAuthorization: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  };
  const gateway: FirmArSigningGateway = {
    createSigningSession: vi.fn(async request => ({
      ...response, requestToken: request.requestToken,
    })),
  };
  return { store, gateway };
}

function input(overrides: Record<string, unknown> = {}) {
  const { store, gateway } = setup();
  return {
    integrationEnabled: true,
    integrationApproved: true,
    authenticatedDoctorId: 'doctor-test-1',
    draft, enrollment,
    returnUrl: 'https://www.autamedica.com/doctors/certificates/return',
    now: new Date('2026-10-27T00:00:00Z'),
    store, gateway, ...overrides,
  };
}

describe('FirmAR signing orchestration', () => {
  it('freezes a PDF and reserves an expiring request before contacting FirmAR', async () => {
    const value = input();
    const output = await prepareFirmArSigningSession(value);
    expect(output.status).toBe('awaiting_doctor_authorization');
    const reserve = vi.mocked(value.store.reserveAndFreeze);
    const signer = vi.mocked(value.gateway.createSigningSession);
    const reservation = reserve.mock.calls[0]?.[0];
    const remoteCall = signer.mock.calls[0]?.[0];
    expect(reservation?.certificateId).toBe(draft.certificateId);
    expect(reservation?.signerCuil).toBe('20123456786');
    expect(reservation?.expiresAt).toBe('2026-10-27T00:10:00.000Z');
    expect(reservation?.originalPdfSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reservation?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(remoteCall?.requestToken).toMatch(/^[a-f0-9]{64}$/);
    expect(reservation?.tokenHash).not.toEqual(remoteCall?.requestToken);
    expect(vi.mocked(value.store.markAwaitingAuthorization)).toHaveBeenCalledWith(
      reservation?.tokenHash, response.authorizationUrl,
    );
  });

  it('does not call FirmAR or storage if integration is disabled or authorization pending', async () => {
    for (const flags of [
      { integrationEnabled: false },
      { integrationApproved: false },
    ]) {
      const value = input(flags);
      await expect(prepareFirmArSigningSession(value)).rejects.toThrow('firmar_integration_not_approved');
      expect(value.store.reserveAndFreeze).not.toHaveBeenCalled();
      expect(value.gateway.createSigningSession).not.toHaveBeenCalled();
    }
  });

  it('rejects unauthorized doctors, unverified enrollment, and non-draft documents', async () => {
    const cases = [
      { authenticatedDoctorId: 'another-doctor' },
      { enrollment: { ...enrollment, verificationStatus: 'pending' } },
      { draft: { ...draft, status: 'signed' } },
      { draft: { ...draft, countryCode: 'BR' } },
    ];
    for (const one of cases) {
      const value = input(one);
      await expect(prepareFirmArSigningSession(value)).rejects.toThrow();
      expect(value.store.reserveAndFreeze).not.toHaveBeenCalled();
    }
  });

  it('prevents creating two concurrent signatures for a certificate', async () => {
    const value = input();
    vi.mocked(value.store.reserveAndFreeze).mockResolvedValue(false);
    await expect(prepareFirmArSigningSession(value)).rejects.toThrow('firmar_duplicate_pending_request');
    expect(value.gateway.createSigningSession).not.toHaveBeenCalled();
  });

  it('marks a reserved request as failed if the remote signer rejects it', async () => {
    const value = input();
    vi.mocked(value.gateway.createSigningSession).mockRejectedValue(new Error('provider_not_ready'));
    await expect(prepareFirmArSigningSession(value)).rejects.toThrow('provider_not_ready');
    expect(value.store.markFailed).toHaveBeenCalledOnce();
  });
});
