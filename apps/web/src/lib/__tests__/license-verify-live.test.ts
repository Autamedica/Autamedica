import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tokenSecret: 'test-only', domainUrl: 'https://test.invalid', role: 'admin', sessionUser: true, authHeader: 'Bearer test-user',
  firstName: 'Nombre', lastName: 'Prueba', licenseNumber: '123456', licenseType: 'MN', province: 'CABA', validatorConfig: vi.fn(),
  createAdmin: vi.fn(), verify: vi.fn(), updateProfile: vi.fn(), updateDoctor: vi.fn(), upsertLicense: vi.fn(),
}));
vi.mock('@autamedica/shared', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: state.createAdmin }));
vi.mock('@/lib/runtime-env', () => ({
  resolveBusTokenSecret: () => state.tokenSecret, resolveBusDomainUrl: () => state.domainUrl,
}));
vi.mock('@autamedica/prescriptions', () => ({
  RefepsApiValidator: class { constructor(config: unknown) { state.validatorConfig(config); } validateMatricula = state.verify; },
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
  state.firstName = 'Nombre'; state.lastName = 'Prueba'; state.licenseNumber = '123456'; state.licenseType = 'MN'; state.province = 'CABA'; state.validatorConfig.mockReset();
  state.role = 'admin'; state.sessionUser = true; state.authHeader = 'Bearer test-user';
  state.verify.mockReset(); state.updateProfile.mockReset(); state.updateDoctor.mockReset(); state.upsertLicense.mockReset();
  state.createAdmin.mockReset();
  state.updateProfile.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  state.updateDoctor.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  state.upsertLicense.mockResolvedValue({ error: null });
  const query = (data: unknown) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) });
  state.createAdmin.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) }, from: (name: string) => {
    if (name === 'profiles') return { ...query({ role: state.role, first_name: state.firstName, last_name: state.lastName }), update: state.updateProfile };
    if (name === 'doctors') return {
      ...query({ id: 'test-doctor', user_id: 'test-user', license_number: state.licenseNumber, license_type: state.licenseType,
        enrollment_jurisdiction: state.province, enrollment_entity: 'Ministerio de Salud', refeps_id: '541000000001' }),
      update: state.updateDoctor,
    };
    if (name === 'doctor_licenses') return { upsert: state.upsertLicense };
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
  it('requests license discovery and matches the existing profile name without requiring an ID from the user', async () => {
    state.verify.mockResolvedValue({isValid:true,source:'national_refeps_api',registrationStatus:'active',practitionerId:'541000000001'});
    expect((await call()).status).toBe(200);
    expect(state.validatorConfig).toHaveBeenCalledWith(expect.objectContaining({discoverByMatricula:true,expectedName:'Nombre Prueba'}));
  });
  it('requires the existing profile name before matching an official registration', async () => {
    state.firstName = '';
    const response = await call();
    expect(response.status).toBe(422);
    expect(state.verify).not.toHaveBeenCalled();
    expect(state.updateProfile).not.toHaveBeenCalled(); expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it.each(['REFEPS_LICENSE_FORMAT','REFEPS_DISCOVERY_NOT_FOUND','REFEPS_DISCOVERY_IDENTITY_MISMATCH','REFEPS_DISCOVERY_AMBIGUOUS'])('preserves the profile when discovery cannot establish a unique match (%s)',async (code)=>{
    state.verify.mockRejectedValue(Object.assign(new Error(code),{code}));
    const response = await call('www.autamedica.com',{doctorId:'test-doctor',persist:true});
    expect(response.status).toBe(422);
    expect(state.updateProfile).not.toHaveBeenCalled(); expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it('verifies an unsaved registration from the form without writing during solo verificar',async()=>{
    state.verify.mockResolvedValue({isValid:true,source:'national_refeps_api',registrationStatus:'active',matriculaNumber:'999999',practitionerId:'541000000001'});
    const response=await call('www.autamedica.com',{doctorId:'test-doctor',persist:false,matricula:'MN999999',jurisdiction:'CABA'});
    expect(state.verify).toHaveBeenCalledWith('MN999999','MN','CABA');
    const payload=await response.json(); expect(payload.data.matricula).toBe('999999');
    expect(state.updateProfile).not.toHaveBeenCalled(); expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it('forwards draft registration fields through the canonical proxy',async()=>{
    state.tokenSecret='';
    const fetcher=vi.fn().mockResolvedValue(Response.json({success:false,error:{code:'UNAUTHENTICATED'}},{status:401}));vi.stubGlobal('fetch',fetcher);
    await call('autamedica-admin-5r9.pages.dev',{doctorId:'test-doctor',persist:false,matricula:'MP31796/6',jurisdiction:'Córdoba'});
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({matricula:'MP31796/6',jurisdiction:'Córdoba',persist:false});
  });
  it.each([{matricula:123},{matricula:''},{jurisdiction:42}])('rejects malformed draft fields before verification (%j)',async (draft)=>{
    expect((await call('www.autamedica.com',{doctorId:'test-doctor',...draft})).status).toBe(400);
    expect(state.verify).not.toHaveBeenCalled();
  });
  it.each(['caba','Capital Federal','Ciudad Autónoma de Buenos Aires'])('recognizes national registration jurisdiction %s',async(jurisdiction)=>{
    state.verify.mockResolvedValue({isValid:true,source:'national_refeps_api',registrationStatus:'active',matriculaNumber:'123456'});
    expect((await call('www.autamedica.com',{doctorId:'test-doctor',matricula:'123456',jurisdiction,persist:false})).status).toBe(200);
    expect(state.verify).toHaveBeenCalledWith('123456','MN','CABA');
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
  it('never marks a profile valid when persisting its official license fails', async () => {
    state.verify.mockResolvedValue({ isValid: true, source: 'national_refeps_api', registrationStatus: 'active',
      matriculaNumber: '123456', practitionerId: '541000000001' });
    state.upsertLicense.mockResolvedValue({ error: { message: 'license insert denied' } });
    const response = await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true });
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload.error.details.reason).toBe('REFEPS_LICENSE_PERSIST_FAILED');
    expect(state.upsertLicense).toHaveBeenCalledOnce();
    expect(state.updateProfile).not.toHaveBeenCalled();
    expect(state.updateDoctor).not.toHaveBeenCalled();
  });
  it('persists the official license before recording SSS approval', async () => {
    state.verify.mockResolvedValue({ isValid: true, source: 'national_refeps_api', registrationStatus: 'active',
      matriculaNumber: '123456', practitionerId: '541000000001' });
    expect((await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true })).status).toBe(200);
    expect(state.upsertLicense).toHaveBeenCalledWith(
      expect.objectContaining({ license_number: '123456', license_type: 'MN', status: 'active' }),
      expect.objectContaining({ onConflict: 'doctor_id,province,license_number' }),
    );
    expect(state.upsertLicense.mock.invocationCallOrder[0]).toBeLessThan(state.updateProfile.mock.invocationCallOrder[0]);
  });
  it('prefers an explicit MP prefix to a stale stored MN type', async () => {
    state.licenseNumber = 'MP341139';
    state.licenseType = 'MN';
    state.province = 'Buenos Aires';
    state.verify.mockResolvedValue({ isValid: true, source: 'national_refeps_api', registrationStatus: 'active',
      matriculaNumber: '341139', practitionerId: '541000000001' });
    expect((await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true })).status).toBe(200);
    expect(state.verify).toHaveBeenCalledWith('MP341139', 'MP', 'Buenos Aires');
    expect(state.upsertLicense).toHaveBeenCalledWith(expect.objectContaining({ license_type: 'MP' }), expect.anything());
    expect(state.updateDoctor).toHaveBeenCalledWith(expect.objectContaining({ license_type: 'MP' }));
  });
  it('uses an explicit stored MN type for an unprefixed matricula even in Buenos Aires', async () => {
    state.licenseNumber = '164231';
    state.licenseType = 'MN';
    state.province = 'Buenos Aires';
    state.verify.mockResolvedValue({ isValid: true, source: 'national_refeps_api', registrationStatus: 'active' });
    expect((await call()).status).toBe(200);
    expect(state.verify).toHaveBeenCalledWith('164231', 'MN', 'Buenos Aires');
  });
  it('persists a valid official result only when requested', async () => {
    state.verify.mockResolvedValue({ isValid: true, source: 'national_refeps_api', registrationStatus: 'active',
      matriculaNumber: '123456', practitionerId: '541000000001' });
    expect((await call('www.autamedica.com', { doctorId: 'test-doctor', persist: true })).status).toBe(200);
    expect(state.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ sss_validation_status: 'valid' }));
    expect(state.updateDoctor).toHaveBeenCalledWith({ license_type: 'MN', refeps_id: '541000000001', license_number: '123456', enrollment_jurisdiction: 'CABA' });
  });
});
