import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tokenSecret: 'test-only', domainUrl: 'https://test.invalid', role: 'admin', sessionUser: true, authHeader: 'Bearer test-user',
  createAdmin: vi.fn(), verify: vi.fn(), updateProfile: vi.fn(), updateDoctor: vi.fn(),
}));
vi.mock('@autamedica/shared', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: state.createAdmin }));
vi.mock('@/lib/runtime-env', () => ({
  resolveBusTokenSecret: () => state.tokenSecret, resolveBusDomainUrl: () => state.domainUrl,
}));
vi.mock('@autamedica/prescriptions', () => ({
  RefepsApiValidator: class { validateMatricula = state.verify; },
}));
import { POST } from '../../pages/api/admin/doctors/license-verify-live';

async function call(host = 'www.autamedica.com', body: unknown = { doctorId: 'test-doctor', persist: false }) {
  const request = new Request(`https://${host}/api/admin/doctors/license-verify-live`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', authorization: state.authHeader, cookie: 'test-session=value', 'x-attacker-header': 'do-not-forward' },
  });
  return POST({ request, locals: { runtime: { env: {} }, session: state.sessionUser ? { user: { id: 'test-admin' } } : null } } as unknown as Parameters<typeof POST>[0]);
}
beforeEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  state.tokenSecret = 'test-only'; state.domainUrl = 'https://test.invalid';
  state.role = 'admin'; state.sessionUser = true; state.authHeader = 'Bearer test-user';
  state.verify.mockReset(); state.updateProfile.mockReset(); state.updateDoctor.mockReset();
  state.createAdmin.mockReset();
  state.updateProfile.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  state.updateDoctor.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const query = (data: unknown) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) });
  state.createAdmin.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) }, from: (name: string) => {
    if (name === 'profiles') return { ...query({ role: state.role }), update: state.updateProfile };
    if (name === 'doctors') return {
      ...query({ id: 'test-doctor', user_id: 'test-user', license_number: '123456',
        enrollment_jurisdiction: 'CABA', enrollment_entity: 'Ministerio de Salud', refeps_id: '541000000001' }),
      update: state.updateDoctor,
    };
    return { upsert: vi.fn().mockResolvedValue({ error: null }) };
  } });
});

describe('administrative official license verification', () => {
  it('proxies an unconfigured production admin to the fixed canonical backend', async () => {
    state.tokenSecret = ''; state.domainUrl = '';
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await call('autamedica-admin-5r9.pages.dev');
    expect(response.status).toBe(401);
    expect(state.createAdmin).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0][0]).toBe('https://www.autamedica.com/api/admin/doctors/license-verify-live');
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
    expect(fetcher.mock.calls[0][1].headers.get('authorization')).toBe('Bearer test-user');
    expect(fetcher.mock.calls[0][1].headers.get('cookie')).toBe('test-session=value');
    expect(fetcher.mock.calls[0][1].headers.get('user-agent')).toBe('AutaMedica-REFEPS-Proxy/1.0');
    expect([...fetcher.mock.calls[0][1].headers.keys()].sort()).toEqual(['authorization', 'content-type', 'cookie', 'user-agent']);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ doctorId: 'test-doctor', persist: false });
  });
  it.each(['www.autamedica.com', 'untrusted.invalid'])('does not loop or proxy unknown hosts (%s)', async (host) => {
    state.tokenSecret = ''; const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await call(host);
    expect(response.status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not claim a timed-out persisted proxy operation was rolled back', async () => {
    state.tokenSecret = '';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network lost')));
    const response = await call('autamedica-admin-5r9.pages.dev', { doctorId: 'test-doctor', persist: true });
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload.error.message).toContain('No se pudo confirmar si la validación se guardó');
  });
  it('rejects unauthenticated canonical requests before querying the registry', async () => {
    state.sessionUser = false; state.authHeader = '';
    expect((await call()).status).toBe(401);
    expect(state.verify).not.toHaveBeenCalled(); expect(state.updateProfile).not.toHaveBeenCalled();
  });
  it('rejects authenticated non-admin callers before querying the registry', async () => {
    state.role = 'patient';
    expect((await call()).status).toBe(401);
    expect(state.verify).not.toHaveBeenCalled(); expect(state.updateProfile).not.toHaveBeenCalled();
  });
  it('does not follow redirects from the canonical destination', async () => {
    state.tokenSecret = '';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://untrusted.invalid' } })));
    expect((await call('autamedica-admin-5r9.pages.dev')).status).toBe(503);
  });
  it.each([null, [], { doctorId: 'test-doctor', persist: 'false' }])('rejects invalid body without a database call', async (input) => {
    expect((await call('www.autamedica.com', input)).status).toBe(400);
    expect(state.createAdmin).not.toHaveBeenCalled();
  });
  it('preserves state and gives a specific error for missing professional identity', async () => {
    state.verify.mockRejectedValue(Object.assign(new Error('REFEPS_ID_REQUIRED'), { code: 'REFEPS_ID_REQUIRED' }));
    const response = await call(); const payload = await response.json();
    expect(response.status).toBe(422); expect(payload.error.details.reason).toBe('REFEPS_ID_REQUIRED');
    expect(state.updateProfile).not.toHaveBeenCalled(); expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it.each([
    ['REFEPS_QUALIFICATIONS_MISSING', 'no devolvió sus matrículas y profesiones'],
    ['REFEPS_LICENSE_NUMBER_MISMATCH', 'no devolvió el número de matrícula'],
    ['REFEPS_LICENSE_JURISDICTION_MISMATCH', 'su organismo emisor no coincide'],
    ['REFEPS_MEDICAL_PROFESSION_UNCONFIRMED', 'no confirmó la profesión médica'],
  ])('reports %s distinctly and preserves state even with autoguardar', async (reason, message) => {
    state.verify.mockRejectedValue(Object.assign(new Error(reason), { code: reason }));
    const response = await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true });
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload.error.details.reason).toBe(reason);
    expect(payload.error.message).toContain(message);
    expect(payload.error.message).toContain('No se modificó la validación');
    expect(state.updateProfile).not.toHaveBeenCalled();
    expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it('shows a bounded institution label for an unrecognized issuer without changing state', async () => {
    state.verify.mockRejectedValue(Object.assign(new Error('REFEPS_LICENSE_JURISDICTION_MISMATCH'), {
      code: 'REFEPS_LICENSE_JURISDICTION_MISMATCH', issuerSummary: 'OTHER MINISTRY',
    }));
    const response = await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true });
    const payload = await response.json();
    expect(payload.error.message).toContain('Emisor informado: OTHER MINISTRY.');
    expect(state.updateProfile).not.toHaveBeenCalled(); expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it('shows profession terminology diagnostics only to the authorized verification flow', async () => {
    state.verify.mockRejectedValue(Object.assign(new Error('REFEPS_MEDICAL_PROFESSION_UNCONFIRMED'), {
      code: 'REFEPS_MEDICAL_PROFESSION_UNCONFIRMED', professionSummary: 'código 2, sistema https://fhir.msal.gob.ar/Profesiones',
    }));
    const response = await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true });
    const payload = await response.json();
    expect(payload.error.message).toContain('Profesión informada: código 2, sistema https://fhir.msal.gob.ar/Profesiones.');
    expect(state.updateProfile).not.toHaveBeenCalled(); expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it('does not persist an official result when only verifying', async () => {
    state.verify.mockResolvedValue({ isValid: true, source: 'national_refeps_api', registrationStatus: 'active', matriculaNumber: '123456' });
    const response = await call(); expect(response.status).toBe(200);
    expect(state.updateProfile).not.toHaveBeenCalled(); expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it('refuses local approvals without changing the profile', async () => {
    state.verify.mockResolvedValue({ isValid: true, source: 'local_database_fallback', registrationStatus: 'active' });
    expect((await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true })).status).toBe(503);
    expect(state.updateProfile).not.toHaveBeenCalled();
  });
  it('persists a valid official result only when requested', async () => {
    state.verify.mockResolvedValue({ isValid: true, source: 'national_refeps_api', registrationStatus: 'active',
      matriculaNumber: '123456', practitionerId: '541000000001' });
    expect((await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true })).status).toBe(200);
    expect(state.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ sss_validation_status: 'valid' }));
    expect(state.updateDoctor).toHaveBeenCalledWith({ refeps_id: '541000000001' });
  });
});
