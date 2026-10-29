import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), issue: vi.fn(), access: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ withAuthRole: mocks.auth, isAuthed: (value: unknown) => !(value instanceof Response) }));
vi.mock('@/lib/api-helpers', () => {
  const reply = (message: string, status: number) => new Response(JSON.stringify({ message }), { status });
  return { badRequest: (s: string) => reply(s, 400), forbidden: (s: string) => reply(s, 403),
    notFound: () => reply('missing', 404), conflict: (s: string) => reply(s, 409),
    internalError: (s: string) => reply(s, 500), jsonOk: (data: unknown) => new Response(JSON.stringify({ success: true, data })) };
});
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: () => ({}) }));
vi.mock('@/lib/doctors/lib/resolve-room', () => ({ doctorHasPatientAccess: mocks.access }));
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/doctors/services/certificate-electronic-issuance.service', () => ({
  loadElectronicCertificateSource: mocks.load, issueElectronicCertificate: mocks.issue,
  assertElectronicCertificateEligible: () => {}, ELECTRONIC_CONFIRMATION: 'Explicit confirmation',
}));

import { POST } from './issue';

const id = '00000000-0000-4000-8000-000000000001';
const request = (body: unknown, origin: string | null = 'https://www.autamedica.com') => new Request(
  `https://www.autamedica.com/api/doctors/certificates/${id}/issue`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  });
const run = (req: Request) => POST({ request: req, params: { id }, locals: {} } as never);

describe('electronic certificate issuance consent and authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'doctor-user' } });
    mocks.load.mockResolvedValue({ snapshotHash: 'a'.repeat(64), doctor: { id: 'doctor' },
      certificate: { status: 'draft', patient_id: 'patient' } });
    mocks.access.mockResolvedValue(true);
    mocks.issue.mockResolvedValue({ id, status: 'signed' });
  });
  it('rejects unauthenticated requests before reading a clinical source', async () => {
    mocks.auth.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await run(request({}))).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('rejects missing explicit physician confirmation', async () => {
    expect((await run(request({ snapshotHash: 'a'.repeat(64) }))).status).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('rejects cross-site confirmation', async () => {
    expect((await run(request({ confirmed: true, snapshotHash: 'a'.repeat(64) }, 'https://evil.invalid'))).status).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('rejects cookie-only requests without an origin', async () => {
    expect((await run(request({ confirmed: true, snapshotHash: 'a'.repeat(64) }, null))).status).toBe(403);
  });
  it('rejects a changed snapshot without applying the signature', async () => {
    expect((await run(request({ confirmed: true, snapshotHash: 'b'.repeat(64) }))).status).toBe(409);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('rejects a doctor without patient access', async () => {
    mocks.access.mockResolvedValue(false);
    expect((await run(request({ confirmed: true, snapshotHash: 'a'.repeat(64) }))).status).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('issues only after matching explicit confirmation by the authenticated physician', async () => {
    expect((await run(request({ confirmed: true, snapshotHash: 'a'.repeat(64) }))).status).toBe(200);
    expect(mocks.issue).toHaveBeenCalledWith({}, expect.anything(), 'doctor-user', '');
  });
});
