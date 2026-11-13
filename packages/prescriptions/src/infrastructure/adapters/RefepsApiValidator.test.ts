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
const directoryForm = '<form id="consulta-profesionales-form"><input type="hidden" name="form_build_id" value="form-test0123456789012345"><input type="hidden" name="form_id" value="argobar_consulta_refeps_profesionales"></form>';
function directoryProfessional(id = federalId, name = 'Profesional', province = 'CABA', profession = 'Médico') {
  return {codigo:id,nombre:name,apellido:'de Prueba',profesiones:[{profesionReferencia:profession,
    matriculas:[{matricula:'123456',provinciaMatricula:province}]}]};
}
function mockDirectory(items: unknown = [directoryProfessional()], initial = directoryForm, resource = practitioner()) {
  const html = `<script>Drupal.settings.refepsProfesionales.allItems = ${JSON.stringify(items)};</script>`;
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(initial)).mockResolvedValueOnce(new Response(html))
    .mockResolvedValueOnce(Response.json({access_token:'test-token'}))
    .mockResolvedValueOnce(Response.json({resourceType:'Bundle',entry:[{resource}]}));
  vi.stubGlobal('fetch',fetcher); return fetcher;
}
function discover(refepsId?: string, expectedName = 'Profesional de Prueba') {
  return new RefepsApiValidator({domainUrl:'https://test.invalid',domainTokenSecret:'test-only',refepsId,
    discoverByMatricula:true,expectedName});
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
    'http://fhir.msal.gob.ar/Profesiones',
    'http://fhir.msal.gov.ar/core/CodeSystem/ProfesionesREFEPS',
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
  it('recognizes the FHIR qualification issuer when identifier.assigner is absent', async () => {
    const p = practitioner();
    Object.assign(p.qualification[0], { issuer: { display: 'MINISTERIO DE SALUD DE LA NACION' } });
    p.qualification[0].identifier[0].assigner.display = '';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN', 'CABA')).resolves.toMatchObject({ isValid: true });
  });
  it.each([
    'http://fhir.msal.gov.ar/entidadesCertificantesREFEPS/10002001110000',
    'https://fhir.msal.gob.ar/entidadesCertificantesREFEPS/10002001110000/',
  ])('recognizes the documented coded national issuer without its label (%s)', async (system) => {
    const p = practitioner();
    Object.assign(p.qualification[0].identifier[0], { system });
    p.qualification[0].identifier[0].assigner.display = '';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN', 'CABA')).resolves.toMatchObject({ isValid: true });
  });
  it('normalizes internal whitespace in the official national name', async () => {
    const p = practitioner();
    p.qualification[0].identifier[0].assigner.display = ' MINISTERIO  DE SALUD DE LA NACIÓN ';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN', 'CABA')).resolves.toMatchObject({ isValid: true });
  });
  it.each([
    ['http://untrusted.invalid/entidadesCertificantesREFEPS/10002001110000', '', undefined],
    ['http://fhir.msal.gov.ar/entidadesCertificantesREFEPS/99999999999999', 'MINISTERIO DE SALUD DE LA NACION', undefined],
    ['http://fhir.msal.gov.ar/entidadesCertificantesREFEPS/10002001110000', 'MINISTERIO DE SALUD DE CORDOBA', undefined],
    ['', 'MINISTERIO DE SALUD', undefined],
    ['', 'UNKNOWN', 'MINISTERIO DE SALUD DE LA NACION'],
    ['', 'MINISTERIO DE SALUD DE LA NACION', 'MINISTERIO DE SALUD DE CORDOBA'],
  ])('preserves jurisdiction safety with unrelated or conflicting issuer evidence (%s, %s, %s)', async (system, display, qualifier) => {
    const p = practitioner();
    Object.assign(p.qualification[0].identifier[0], { system });
    p.qualification[0].identifier[0].assigner.display = display ?? '';
    Object.assign(p.qualification[0], { issuer: { display: qualifier } });
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN', 'CABA')).rejects.toMatchObject({
      code: 'REFEPS_LICENSE_JURISDICTION_MISMATCH',
    });
  });
  it('does not use the national entity code to confirm a provincial license', async () => {
    const p = practitioner();
    Object.assign(p.qualification[0].identifier[0], { system: 'http://fhir.msal.gov.ar/entidadesCertificantesREFEPS/10002001110000' });
    p.qualification[0].identifier[0].assigner.display = 'MINISTERIO DE SALUD DE CORDOBA';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MP', 'Córdoba')).rejects.toMatchObject({
      code: 'REFEPS_LICENSE_JURISDICTION_MISMATCH',
    });
  });
  it('includes bounded institution-only diagnostics when the issuer is unrecognized', async () => {
    const p = practitioner(); p.qualification[0].identifier[0].assigner.display = 'OTHER MINISTRY';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({
      code: 'REFEPS_LICENSE_JURISDICTION_MISMATCH', issuerSummary: 'OTHER MINISTRY',
    });
  });
  it('reports the profession coding without returning query strings from its URI', async () => {
    const p = practitioner();
    Object.assign(p.qualification[0].code.coding[0], {
      system: 'https://fhir.msal.gob.ar/Profesiones?secret=do-not-disclose', code: '2',
    });
    mockResponses(undefined, p);
    const error = await create().validateMatricula('123456', 'MN').catch((caught: unknown) => caught);
    expect(error).toMatchObject({code: 'REFEPS_MEDICAL_PROFESSION_UNCONFIRMED',
      professionSummary: 'código 2, sistema https://fhir.msal.gob.ar/Profesiones'});
    expect(JSON.stringify(error)).not.toContain('do-not-disclose');
  });
  it.each(['https://untrusted.invalid/Profesiones', 'not-a-uri', 'https://secret@fhir.msal.gob.ar/Profesiones'])('does not echo unsafe terminology URIs (%s)', async (system) => {
    const p = practitioner(); Object.assign(p.qualification[0].code.coding[0], {system,code:'2'});
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({
      code: 'REFEPS_MEDICAL_PROFESSION_UNCONFIRMED',
      professionSummary: 'código 2, sistema ausente o no reconocido',
    });
  });
  it('reports missing profession coding explicitly', async () => {
    const p = practitioner(); p.qualification[0].code.coding = []; mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN')).rejects.toMatchObject({
      professionSummary: 'Sin codificación de profesión en la matrícula coincidente',
    });
  });
  // Regression from the actual integration: current catalogue 35 is medicine.
  // Synthetic identity/registration; no real professional identifiers are stored here.
  it.each([
    'http://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS',
    'https://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS/',
  ])('completes official verification for current medical coding 35 (%s)', async (system) => {
    const p = practitioner();
    Object.assign(p.qualification[0].code.coding[0], {system,code:'35',display:'Médico'});
    Object.assign(p.qualification[0].identifier[0], {system:'http://fhir.msal.gov.ar/entidadesCertificantesREFEPS/10002001110000'});
    p.qualification[0].identifier[0].assigner.display = 'Ministerio de Salud';
    mockResponses(undefined, p);
    await expect(create().validateMatricula('123456', 'MN', 'CABA')).resolves.toMatchObject({
      isValid:true,matriculaNumber:'123456',matriculaType:'MN',province:'CABA',
      practitionerId:federalId,registrationStatus:'active',source:'national_refeps_api',
    });
  });
  it.each([
    ['http://fhir.msal.gob.ar/core/CodeSystem/ProfesionesREFEPS','35','Médico'],
    ['http://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS','1','Médico'],
    ['http://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS','36','Médico'],
    ['http://untrusted.invalid/CodeSystem/profesionesREFEPSCS','35','Médico'],
    ['http://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS','35','Ingeniero químico'],
  ])('does not transfer codes between catalogues or accept contradictory labels (%s, %s, %s)', async (system, code, display) => {
    const p = practitioner(); Object.assign(p.qualification[0].code.coding[0],{system,code,display});
    mockResponses(undefined,p);
    await expect(create().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({
      code:'REFEPS_MEDICAL_PROFESSION_UNCONFIRMED',
    });
  });
  it('still rejects a wrong registration with the current medical code', async () => {
    const p = practitioner(); Object.assign(p.qualification[0].code.coding[0],{
      system:'http://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS',code:'35',
    });
    mockResponses(undefined,p);
    await expect(create().validateMatricula('999999','MN','CABA')).rejects.toMatchObject({code:'REFEPS_LICENSE_NUMBER_MISMATCH'});
  });
  it('still requires an enabled registration with the current medical code', async () => {
    const p = practitioner(false); Object.assign(p.qualification[0].code.coding[0],{
      system:'http://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS',code:'35',
    });
    mockResponses(undefined,p);
    await expect(create().validateMatricula('123456','MN','CABA')).resolves.toMatchObject({isValid:false,registrationStatus:'suspended'});
  });
  it.each([undefined,'','not-a-federal-id','541000000099'])('resolves a registration without a manually populated or current registry identity (%s)', async (storedId) => {
    const fetcher = mockDirectory();
    await expect(discover(storedId).validateMatricula('M.N. 123.456','MN','CABA')).resolves.toMatchObject({
      isValid:true,matriculaNumber:'123456',practitionerId:federalId,source:'national_refeps_api',
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[0][0]).toBe('https://www.argentina.gob.ar/salud/buscador-nacional-de-profesionales-de-la-salud');
    const body = new URLSearchParams(fetcher.mock.calls[1][1].body);
    expect(body.get('searchBy')).toBe('matricula'); expect(body.get('matricula')).toBe('123456');
    expect(body.get('form_id')).toBe('argobar_consulta_refeps_profesionales');
    expect(new URL(fetcher.mock.calls[3][0]).searchParams.get('identifier')).toBe(`https://sisa.msal.gov.ar/REFEPS|${federalId}`);
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
    expect(fetcher.mock.calls[1][1].redirect).toBe('manual');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it('discovers missing identities for existing callers without the discovery flag',async()=>{
    mockDirectory();
    await expect(create('').validateMatricula('123456','MN','CABA')).resolves.toMatchObject({isValid:true,practitionerId:federalId});
  });
  it('completes discovery with the Cloudflare Workers redirect contract',async()=>{
    const upstream=mockDirectory();
    const fetcher=vi.fn((url,init:RequestInit)=>{
      if(init?.redirect === 'error') throw new TypeError('Invalid redirect value');
      return upstream(url,init);
    });
    vi.stubGlobal('fetch',fetcher);
    await expect(discover().validateMatricula('123456','MN','CABA')).resolves.toMatchObject({isValid:true});
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it.each(['GET','POST'])('rejects a directory %s redirect without following its location or authenticating',async(method)=>{
    const fetcher=vi.fn();
    if(method==='POST') fetcher.mockResolvedValueOnce(new Response(directoryForm));
    fetcher.mockResolvedValueOnce(new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/collect'}}));
    vi.stubGlobal('fetch',fetcher);
    await expect(discover().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_DISCOVERY_UNAVAILABLE'});
    expect(fetcher).toHaveBeenCalledTimes(method==='POST'?2:1);
    for(const [url,init] of fetcher.mock.calls){
      expect(url).toBe('https://www.argentina.gob.ar/salud/buscador-nacional-de-profesionales-de-la-salud');
      expect(init.redirect).toBe('manual');
      expect(init.headers.Authorization).toBeUndefined();
    }
  });
  it('normalizes an MN prefix even with a cached federal identity', async () => {
    mockResponses();
    await expect(create().validateMatricula('MN-123456','MN','CABA')).resolves.toMatchObject({isValid:true,matriculaNumber:'123456'});
  });
  it('does not discard substantive alphabetic characters from a registration',async()=>{
    const fetcher=vi.fn(); vi.stubGlobal('fetch',fetcher);
    await expect(discover().validateMatricula('ABC123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_LICENSE_FORMAT'});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('filters professions and jurisdiction before resolving a public identity',async()=>{
    mockDirectory([directoryProfessional('541000000002','Profesional','Buenos Aires'),directoryProfessional('541000000003','Profesional','CABA','Enfermero'),directoryProfessional()]);
    await expect(discover().validateMatricula('123456','MN','CABA')).resolves.toMatchObject({isValid:true});
  });
  it('matches accented/reordered profile names using existing profile data',async()=>{
    mockDirectory();
    await expect(discover(undefined,'Prueba de Profésional').validateMatricula('123456','MN','CABA')).resolves.toMatchObject({isValid:true});
  });
  it('does not bind a registration to a different profile name',async()=>{
    const fetcher=mockDirectory();
    await expect(discover(undefined,'Otra Persona').validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_DISCOVERY_IDENTITY_MISMATCH'});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not select the first ambiguous physician when identity cannot distinguish them',async()=>{
    const fetcher=mockDirectory([directoryProfessional(),directoryProfessional('541000000002')]);
    await expect(discover().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_DISCOVERY_AMBIGUOUS'});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('uses the profile name to distinguish different people sharing a registration number',async()=>{
    mockDirectory([directoryProfessional('541000000002','Otra'),directoryProfessional()]);
    await expect(discover().validateMatricula('123456','MN','CABA')).resolves.toMatchObject({isValid:true});
  });
  it('deduplicates identical federal identities',async()=>{
    mockDirectory([directoryProfessional(),directoryProfessional()]);
    await expect(discover().validateMatricula('123456','MN','CABA')).resolves.toMatchObject({isValid:true});
  });
  it.each([{items:[]},{items:[directoryProfessional(federalId,'Profesional','Córdoba')]}])('preserves state when no matching registration is returned (%j)',async({items})=>{
    const fetcher=mockDirectory(items);
    await expect(discover().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_DISCOVERY_NOT_FOUND'});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([{},[{codigo:'not-an-id'}]])('does not interpret malformed public data as a valid or absent license (%j)',async(items)=>{
    mockDirectory(items);
    await expect(discover().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_DISCOVERY_INVALID_RESPONSE'});
  });
  it('rejects changed or unavailable forms without sending auth credentials',async()=>{
    const fetcher=mockDirectory(undefined,'<html>Unavailable</html>');
    await expect(discover().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_DISCOVERY_INVALID_RESPONSE'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('never executes returned scripts while extracting the public directory data',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(directoryForm))
      .mockResolvedValueOnce(new Response('<script>Drupal.settings.refepsProfesionales.allItems = [evil()];</script>')));
    await expect(discover().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_DISCOVERY_INVALID_RESPONSE'});
  });
  it('does not approve from public directory data when the authenticated lookup fails',async()=>{
    const fetcher=mockDirectory(); fetcher.mockReset();
    fetcher.mockResolvedValueOnce(new Response(directoryForm))
      .mockResolvedValueOnce(new Response(`<script>Drupal.settings.refepsProfesionales.allItems = ${JSON.stringify([directoryProfessional()])};</script>`))
      .mockResolvedValueOnce(new Response('do-not-expose',{status:403}));
    await expect(discover().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_AUTH_FAILED'});
  });
  it('discovers and verifies a compound provincial registration without losing its suffix',async()=>{
    const item=directoryProfessional(federalId,'Profesional','Córdoba'); item.profesiones[0].matriculas[0].matricula='31796/6';
    const resource=practitioner(); resource.qualification[0].identifier[0]={value:'31796/6',assigner:{display:'MINISTERIO DE SALUD DE CORDOBA'}};
    const fetcher=mockDirectory([item],directoryForm,resource);
    await expect(discover().validateMatricula('M.P. 31796/6','MP','Córdoba')).resolves.toMatchObject({isValid:true,matriculaNumber:'31796/6'});
    expect(new URLSearchParams(fetcher.mock.calls[1][1].body).get('matricula')).toBe('31796/6');
  });
  it('does not confuse a provincial suffix with a different flat registration',async()=>{
    const resource=practitioner(); resource.qualification[0].identifier[0]={value:'317966',assigner:{display:'MINISTERIO DE SALUD DE CORDOBA'}};
    mockResponses(undefined,resource);
    await expect(create().validateMatricula('31796/6','MP','Córdoba')).rejects.toMatchObject({code:'REFEPS_LICENSE_NUMBER_MISMATCH'});
  });
  it('does not match a flattened provincial registration during discovery',async()=>{
    const item=directoryProfessional(federalId,'Profesional','Córdoba'); item.profesiones[0].matriculas[0].matricula='317966';
    mockDirectory([item]);
    await expect(discover().validateMatricula('31796/6','MP','Córdoba')).rejects.toMatchObject({code:'REFEPS_DISCOVERY_NOT_FOUND'});
  });
  it('bounds the combined public form lookup time',async()=>{
    vi.useFakeTimers();
    vi.stubGlobal('fetch',vi.fn((_url,init:RequestInit)=>new Promise((_resolve,reject)=>{
      init.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')));
    })));
    const check=expect(discover().validateMatricula('123456','MN','CABA')).rejects.toMatchObject({code:'REFEPS_TIMEOUT'});
    await vi.advanceTimersByTimeAsync(15000); await check;
  });
  it('does not call the registry with missing credentials or approve from a fallback', async () => {
    const fallback = { validateMatricula: vi.fn().mockResolvedValue({ isValid: true }) };
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new RefepsApiValidator({ fallbackValidator: fallback }).validateMatricula('123456', 'MN'))
      .rejects.toMatchObject({ code: 'REFEPS_CREDENTIALS_MISSING' });
    expect(fallback.validateMatricula).not.toHaveBeenCalled();
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
