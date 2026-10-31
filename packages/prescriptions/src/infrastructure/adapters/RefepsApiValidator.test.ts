import { afterEach, describe, expect, it, vi } from 'vitest';
import { RefepsApiValidator } from './RefepsApiValidator';

// Synthetic fixtures; these tests never query a real professional or production registry.
const federalId = '541000000001';
function practitioner(enabled = true) {
  return {
    resourceType: 'Practitioner', id: '1000001', active: true,
    identifier: [{ system: 'https://sisa.msal.gov.ar/REFEPS', value: federalId }],
    name: [{ text: 'Profesional de prueba' }],
    qualification: [{
      code: { coding: [{ system: 'http://fhir.msal.gov.ar/ValueSet/Profesiones_REFEPS', code: '1', display: 'Médico' }] },
      identifier: [{ value: '123456', assigner: { display: 'MINISTERIO DE SALUD DE LA NACION' } }],
      extension: [{ url: 'http://fhir.msal.gob.ar/StructureDefinition/MatriculaHabilitada', valueBoolean: enabled }],
    }],
  };
}
function create(refepsId = federalId) {
  return new RefepsApiValidator({ domainUrl: 'https://test.invalid', domainTokenSecret: 'test-only', refepsId });
}
function mockResponses(token: unknown = { access_token: 'test-token' }, resource: unknown = practitioner()) {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(token))
    .mockResolvedValueOnce(Response.json({ resourceType: 'Bundle', entry: [{ resource }] }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('official REFEPS verification', () => {
  it.each(['access_token', 'accessToken'])('accepts the %s token response and sends its bearer token', async (key) => {
    const fetcher = mockResponses({ [key]: 'test-token' });
    const result = await create().validateMatricula('123456', 'MN', 'CABA');
    expect(result).toMatchObject({ isValid: true, practitionerId: federalId, source: 'national_refeps_api' });
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer test-token');
    const query = new URL(fetcher.mock.calls[1][0]);
    expect(query.searchParams.get('identifier')).toBe(`https://sisa.msal.gov.ar/REFEPS|${federalId}`);
    expect(query.searchParams.get('identifier')).not.toContain('|123456');
  });
  // Contracts: simplifier.net/guide/PractitionerREFEPS/Valuesets3 and
  // guias.hl7.org.ar/site/CodeSystem-ProfesionesREFEPS.html.
  it.each([
    'http://fhir.msal.gov.ar/ValueSet/Profesiones_REFEPS',
    'http://fhir.msal.gob.ar/ValueSet/Profesiones_REFEPS',
    'http://fhir.msal.gov.ar/Profesiones',
    'http://fhir.msal.gob.ar/core/CodeSystem/ProfesionesREFEPS',
    'https://fhir.msal.gob.ar/core/CodeSystem/ProfesionesREFEPS/',
  ])('recognizes medical code 1 in the documented namespace %s', async (system) => {
    const p = practitioner(); p.qualification[0].code.coding[0].system = system;
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN', 'CABA')).resolves.toMatchObject({
      isValid: true, source: 'national_refeps_api', registrationStatus: 'active',
    });
  });
  it.each([
    ['http://untrusted.invalid/Profesiones_REFEPS', '1'],
    ['http://fhir.msal.gob.ar/core/CodeSystem/ProfesionesREFEPS.evil', '1'],
    ['http://fhir.msal.gob.ar/core/CodeSystem/ProfesionesREFEPS', '2'],
    ['', '1'],
  ])('does not infer medicine from display or an unrelated code namespace (%s, %s)', async (system, code) => {
    const p = practitioner(); Object.assign(p.qualification[0].code.coding[0], { system, code });
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN', 'CABA')).rejects.toMatchObject({
      code: 'REFEPS_MEDICAL_PROFESSION_UNCONFIRMED',
    });
  });
  it('distinguishes missing qualification data from a license-number mismatch', async () => {
    const p = practitioner(); p.qualification = []; mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({
      code: 'REFEPS_QUALIFICATIONS_MISSING',
    });
  });
  it('does not combine the requested number with an issuer on another identifier', async () => {
    const p = practitioner();
    p.qualification[0].identifier = [
      { value: '123456', assigner: { display: 'UNKNOWN' } },
      { value: '999999', assigner: { display: 'MINISTERIO DE SALUD DE LA NACION' } },
    ];
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({
      code: 'REFEPS_LICENSE_JURISDICTION_MISMATCH',
    });
  });
  it('does not take the medical profession from a different qualification', async () => {
    const p = practitioner();
    p.qualification.push(structuredClone(p.qualification[0]));
    p.qualification[0].code.coding[0].code = '2';
    p.qualification[1].identifier[0].value = '999999';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({
      code: 'REFEPS_MEDICAL_PROFESSION_UNCONFIRMED',
    });
  });
  it('retains explicit habilitation checks for the core medical CodeSystem', async () => {
    const p = practitioner(false);
    p.qualification[0].code.coding[0].system = 'http://fhir.msal.gob.ar/core/CodeSystem/ProfesionesREFEPS';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).resolves.toMatchObject({
      isValid: false, registrationStatus: 'suspended',
    });
  });
  it('does not call the registry with missing credentials or approve from a fallback', async () => {
    const fallback = { validateMatricula: vi.fn().mockResolvedValue({ isValid: true }) };
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new RefepsApiValidator({ fallbackValidator: fallback }).validateMatricula('123456', 'MN'))
      .rejects.toMatchObject({ code: 'REFEPS_CREDENTIALS_MISSING' });
    expect(fallback.validateMatricula).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['', 'mock-not-a-registry-id'])('requires a registry identity before querying (%s)', async (id) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(create(id).validateMatricula('123456', 'MN')).rejects.toMatchObject({ code: 'REFEPS_ID_REQUIRED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not send Bearer undefined when authentication omits its token', async () => {
    const fetcher = mockResponses({});
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({ code: 'REFEPS_AUTH_TOKEN_MISSING' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sanitizes authentication errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive-upstream-body', { status: 403 })));
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({
      message: 'REFEPS_AUTH_FAILED', code: 'REFEPS_AUTH_FAILED', upstreamStatus: 403,
    });
  });
  it('preserves logical-resource ID lookup and returns the federal ID for storage', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json(practitioner()));
    vi.stubGlobal('fetch', fetcher);
    const result = await create('1000001').validateMatricula('123456', 'MN');
    expect(fetcher.mock.calls[1][0]).toBe('https://bus.msal.gob.ar/fhir/Practitioner/1000001');
    expect(result.practitionerId).toBe(federalId);
  });
  it('does not interpret an OperationOutcome as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ resourceType: 'OperationOutcome' })));
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({ code: 'REFEPS_INVALID_RESPONSE' });
  });
  it('returns not-found only for an explicit empty official Bundle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ resourceType: 'Bundle', total: 0 })));
    await expect(create().validateMatricula('123456', 'MN')).resolves.toMatchObject({
      isValid: false, registrationStatus: 'not_found', source: 'national_refeps_api',
    });
  });
  it('rejects a different practitioner even when a matching license number is present', async () => {
    const p = practitioner(); p.identifier[0].value = '541000000002'; mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({ code: 'REFEPS_IDENTITY_MISMATCH' });
  });
  it('requires the requested license number', async () => {
    mockResponses();
    await expect(create().validateMatricula('999999', 'MN')).rejects.toMatchObject({ code: 'REFEPS_LICENSE_NUMBER_MISMATCH' });
  });
  it('does not approve the same license in a different jurisdiction', async () => {
    mockResponses();
    await expect(create().validateMatricula('123456', 'MP', 'Córdoba')).rejects.toMatchObject({ code: 'REFEPS_LICENSE_JURISDICTION_MISMATCH' });
  });
  it('never matches CABA issuer as Buenos Aires province', async () => {
    const p = practitioner();
    p.qualification[0].identifier[0].assigner.display = 'MINISTERIO DE SALUD DE LA CIUDAD AUTONOMA DE BUENOS AIRES';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MP', 'Buenos Aires')).rejects.toMatchObject({ code: 'REFEPS_LICENSE_JURISDICTION_MISMATCH' });
  });
  it('requires explicitly enabled medical qualification', async () => {
    mockResponses(undefined, practitioner(false));
    await expect(create().validateMatricula('123456', 'MN')).resolves.toMatchObject({ isValid: false, registrationStatus: 'suspended' });
  });
  it('does not infer license habilitation from an active practitioner', async () => {
    const p = practitioner(); p.qualification[0].extension = []; mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({ code: 'REFEPS_LICENSE_STATUS_UNKNOWN' });
  });
  it('bounds upstream waiting and reports timeouts separately', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const check = expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({ code: 'REFEPS_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10_000); await check;
  });
});
