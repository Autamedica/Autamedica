import { createHmac } from 'node:crypto';
import type { IRefepsValidator, RefepsValidationResult } from '../../domain/refeps.ports';
import { discoverRefepsId, normalizeRefepsLicense, refepsLicenseKey } from './RefepsPublicDirectory';

const REFEPS_SYSTEM = 'https://sisa.msal.gov.ar/REFEPS';
const TIMEOUT_MS = 10_000;
// Published REFEPS example and terminology contracts use these distinct URIs.
// Match the namespace as well as code 1; unrelated systems can reuse that code.
const LEGACY_MEDICAL_PROFESSION_SYSTEMS = new Set([
  'http://fhir.msal.gov.ar/ValueSet/Profesiones_REFEPS',
  'http://fhir.msal.gob.ar/ValueSet/Profesiones_REFEPS',
  'http://fhir.msal.gov.ar/Profesiones',
  'http://fhir.msal.gob.ar/Profesiones',
  'http://fhir.msal.gov.ar/core/CodeSystem/ProfesionesREFEPS',
  'http://fhir.msal.gob.ar/core/CodeSystem/ProfesionesREFEPS',
]);
// Current Bus response, cross-checked against the same official public REFEPS record:
// this catalogue uses 35 for medicine, unlike the legacy catalogue's code 1.
const CURRENT_MEDICAL_PROFESSION_SYSTEM = 'http://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS';

type Config = {
  baseUrl?: string;
  domainTokenSecret?: string;
  domainUrl?: string;
  fallbackValidator?: IRefepsValidator;
  refepsId?: string;
  discoverByMatricula?: boolean;
  expectedName?: string;
};
type Identifier = { system?: string; value?: string; assigner?: { display?: string } };
type ProfessionCoding = { system?: string; code?: string; display?: string };
type Qualification = {
  issuer?: { display?: string };
  code?: { text?: string; coding?: ProfessionCoding[] };
  identifier?: Identifier[];
  extension?: Array<{ url?: string; valueBoolean?: boolean }>;
};
type Practitioner = {
  resourceType?: string;
  id?: string;
  identifier?: Identifier[];
  active?: boolean;
  name?: Array<{ given?: string[]; family?: string; text?: string }>;
  qualification?: Qualification[];
};

function fail(code: string, upstreamStatus?: number, issuerSummary?: string, professionSummary?: string): never {
  // Never include upstream bodies: authentication responses can contain secrets.
  throw Object.assign(new Error(code), { code, upstreamStatus, issuerSummary, professionSummary });
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isMedicalProfession(coding: ProfessionCoding): boolean {
  const system = coding.system?.replace(/^https:/, 'http:').replace(/\/$/, '');
  if (!system) return false;
  const medicalCode = system === CURRENT_MEDICAL_PROFESSION_SYSTEM ? '35'
    : LEGACY_MEDICAL_PROFESSION_SYSTEMS.has(system) ? '1' : undefined;
  if (!medicalCode || coding.code !== medicalCode) return false;
  // A recognized code cannot override an explicitly contradictory profession label.
  return !coding.display?.trim() || ['medico', 'medica', 'medico/a'].includes(normalized(coding.display));
}

function matchesIssuer(identifier: Identifier, qualification: Qualification, type: 'MN' | 'MP', province?: string): boolean {
  // The REFEPS example associates this exact namespace with the national ministry.
  const system = identifier.system?.replace(/^https:/, 'http:').replace(/\/$/, '') ?? '';
  const entityCode = /^http:\/\/fhir\.msal\.(?:gov|gob)\.ar\/entidadesCertificantesREFEPS\/(\d+)$/.exec(system)?.[1];
  const nationalEntity = entityCode === '10002001110000';
  if (nationalEntity && type !== 'MN') return false;
  if (entityCode && !nationalEntity && type === 'MN') return false;
  const displays = [identifier.assigner?.display, qualification.issuer?.display]
    .filter((value): value is string => typeof value === 'string' && !!value.trim()).map(normalized);
  const jurisdiction = normalized(province ?? '');
  const expected = type === 'MN' ? ['ministerio de salud de la nacion'] : jurisdiction ? [
    `ministerio de salud de la provincia de ${jurisdiction}`,
    `ministerio de salud de ${jurisdiction}`,
  ] : [];
  // A coded issuer can supply missing/generic text, but cannot override contradictions.
  if (nationalEntity) return displays.every((display) => expected.includes(display) || display === 'ministerio de salud');
  return displays.length > 0 && displays.every((display) => expected.includes(display));
}

function isRefepsSystem(value?: string): boolean {
  return value?.replace(/^http:/, 'https:').replace(/\/$/, '') === REFEPS_SYSTEM;
}

function assertion(domainUrl: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: domainUrl, iat: now, exp: now + 300, aud: 'aud', sub: 'sub',
    name: 'AutaMedica Integrator', ident: 'autamedica', role: 'system',
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}

export class RefepsApiValidator implements IRefepsValidator {
  private readonly config: Config;

  constructor(configOrApiKey: string | Config, baseUrl?: string) {
    this.config = typeof configOrApiKey === 'object' ? configOrApiKey : { baseUrl };
  }

  private async request(url: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        fail(init?.method === 'POST' ? 'REFEPS_AUTH_FAILED' : 'REFEPS_LOOKUP_FAILED', response.status);
      }
      try {
        return await response.json();
      } catch {
        fail(controller.signal.aborted ? 'REFEPS_TIMEOUT' : 'REFEPS_INVALID_RESPONSE');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error
        && typeof error.code === 'string' && error.code.startsWith('REFEPS_')) throw error;
      fail(controller.signal.aborted ? 'REFEPS_TIMEOUT' : 'REFEPS_NETWORK_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAuthToken(): Promise<string> {
    const { domainUrl, domainTokenSecret } = this.config;
    if (!domainUrl || !domainTokenSecret) fail('REFEPS_CREDENTIALS_MISSING');
    const data = await this.request(`${this.baseUrl}/bus-auth/v2/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grantType: 'client_credentials', scope: 'Practitioner/*.read',
        clientAssertionType: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        clientAssertion: assertion(domainUrl, domainTokenSecret),
      }),
    });
    if (!data || typeof data !== 'object') fail('REFEPS_AUTH_TOKEN_MISSING');
    // Published OAuth contract uses access_token; retain the deployed camelCase variant.
    const value = data as { access_token?: unknown; accessToken?: unknown };
    const token = typeof value.access_token === 'string' && value.access_token.trim()
      ? value.access_token : value.accessToken;
    if (typeof token !== 'string' || !token.trim()) fail('REFEPS_AUTH_TOKEN_MISSING');
    return token.trim();
  }

  private get baseUrl(): string {
    return (this.config.baseUrl || 'https://bus.msal.gob.ar').replace(/\/$/, '');
  }

  async validateMatricula(matricula: string, type: 'MN' | 'MP', province?: string): Promise<RefepsValidationResult> {
    const { domainTokenSecret, domainUrl } = this.config;
    if (!domainTokenSecret || !domainUrl) fail('REFEPS_CREDENTIALS_MISSING');
    matricula = normalizeRefepsLicense(matricula, type);
    let refepsId = this.config.refepsId?.trim();
    // A registration number is not a federal REFEPS identifier. Never substitute it.
    if (this.config.discoverByMatricula || !refepsId || !/^\d{1,12}$/.test(refepsId)) {
      refepsId = await discoverRefepsId(matricula, type, province, this.config.expectedName);
    }
    const federalId = /^\d{12}$/.test(refepsId);
    const token = await this.getAuthToken();
    const path = federalId
      ? `/fhir/Practitioner?identifier=${encodeURIComponent(`${REFEPS_SYSTEM}|${refepsId}`)}`
      : `/fhir/Practitioner/${encodeURIComponent(refepsId)}`;
    const raw = await this.request(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/fhir+json' },
    });
    if (!raw || typeof raw !== 'object') fail('REFEPS_INVALID_RESPONSE');
    const payload = raw as { resourceType?: string; entry?: Array<{ resource?: Practitioner }>; total?: number };
    let practitioners: Practitioner[];
    if (federalId) {
      if (payload.resourceType !== 'Bundle') fail('REFEPS_INVALID_RESPONSE');
      if (payload.entry !== undefined && !Array.isArray(payload.entry)) fail('REFEPS_INVALID_RESPONSE');
      practitioners = (payload.entry ?? []).flatMap((e) => e.resource ? [e.resource] : []);
      if (!practitioners.length) {
        if (payload.total !== 0) fail('REFEPS_INVALID_RESPONSE');
        return { isValid: false, matriculaNumber: matricula, matriculaType: type,
          registrationStatus: 'not_found', source: 'national_refeps_api' };
      }
    } else {
      practitioners = [raw as Practitioner];
    }
    const matches = practitioners.filter((p) => p.resourceType === 'Practitioner'
      && (federalId ? p.identifier?.some((i) => isRefepsSystem(i.system) && i.value === refepsId) : p.id === refepsId));
    if (matches.length !== 1) fail('REFEPS_IDENTITY_MISMATCH');
    const practitioner = matches[0];
    if (!practitioner) fail('REFEPS_IDENTITY_MISMATCH');
    const registryId = practitioner.identifier?.find((i) => isRefepsSystem(i.system))?.value;
    if (!registryId || !/^\d{12}$/.test(registryId)) fail('REFEPS_INVALID_RESPONSE');
    const qualifications = practitioner.qualification ?? [];
    if (!qualifications.length) fail('REFEPS_QUALIFICATIONS_MISSING');
    const matchesNumber = (i: Identifier): boolean => !!i.value
      && refepsLicenseKey(i.value, type) === matricula;
    const numbered = qualifications.filter((q) => q.identifier?.some(matchesNumber));
    if (!numbered.length) fail('REFEPS_LICENSE_NUMBER_MISMATCH');
    const jurisdictionMatches = numbered.filter((q) => q.identifier?.some((i) => {
      if (!matchesNumber(i)) return false;
      return matchesIssuer(i, q, type, province);
    }));
    if (!jurisdictionMatches.length) {
      // Institution labels only: omit names, documents, license numbers and raw URIs.
      const labels = numbered.flatMap((q) => [q.issuer?.display,
        ...q.identifier?.filter(matchesNumber).map((i) => i.assigner?.display) ?? []])
        .filter((value): value is string => typeof value === 'string' && !!value.trim())
        .map((value) => value.replace(/[^\p{L}\p{N} .,'()/-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100));
      fail('REFEPS_LICENSE_JURISDICTION_MISMATCH', undefined,
        [...new Set(labels)].slice(0, 2).join(' / ') || 'Sin nombre de organismo emisor');
    }
    const license = jurisdictionMatches.find((q) => q.code?.coding?.some(isMedicalProfession));
    if (!license) {
      // Only terminology metadata; never echo full resources or query strings.
      const codings = jurisdictionMatches.flatMap((q) => q.code?.coding ?? []).slice(0, 4);
      const summaries = codings.map((coding) => {
        const code = typeof coding.code === 'string' && /^[A-Za-z0-9._-]{1,30}$/.test(coding.code)
          ? coding.code : 'ausente o no interpretable';
        let system = 'ausente o no reconocido';
        if (typeof coding.system === 'string') {
          try {
            const uri = new URL(coding.system);
            if (['http:', 'https:'].includes(uri.protocol) && ['fhir.msal.gov.ar', 'fhir.msal.gob.ar'].includes(uri.hostname)
              && !uri.username && !uri.password && /^[A-Za-z0-9/_-]{1,140}$/.test(uri.pathname)) {
              system = `${uri.protocol}//${uri.hostname}${uri.pathname}`;
            }
          } catch { /* Invalid terminology URI: keep the bounded diagnostic. */ }
        }
        return `código ${code}, sistema ${system}`;
      });
      fail('REFEPS_MEDICAL_PROFESSION_UNCONFIRMED', undefined, undefined,
        summaries.join('; ') || 'Sin codificación de profesión en la matrícula coincidente');
    }
    const enabled = license.extension?.find((e) => e.url?.endsWith('/MatriculaHabilitada'))?.valueBoolean;
    if (typeof practitioner.active !== 'boolean' || typeof enabled !== 'boolean') fail('REFEPS_LICENSE_STATUS_UNKNOWN');
    const isValid = practitioner.active && enabled;
    const name = practitioner.name?.[0];
    const specialty = qualifications.find((q) => q.code?.coding?.some((c) => c.system?.includes('/Especialidades_REFEPS')));
    return {
      isValid, matriculaNumber: matricula, matriculaType: type, province,
      fullName: name?.text || [name?.given?.join(' '), name?.family].filter(Boolean).join(' '),
      specialty: specialty?.code?.text || specialty?.code?.coding?.[0]?.display,
      // Store the federal identifier, not FHIR's distinct logical resource id.
      practitionerId: registryId,
      qualifications: qualifications.map((q) => ({
        text: q.code?.text || q.code?.coding?.[0]?.display,
        identifiers: q.identifier?.map((i) => ({ system: i.system, value: i.value })),
      })),
      source: 'national_refeps_api', registrationStatus: isValid ? 'active' : 'suspended',
    };
  }
}
