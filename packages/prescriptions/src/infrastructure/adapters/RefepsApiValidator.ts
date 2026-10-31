import { createHmac } from 'node:crypto';
import type { IRefepsValidator, RefepsValidationResult } from '../../domain/refeps.ports';

const REFEPS_SYSTEM = 'https://sisa.msal.gov.ar/REFEPS';
const TIMEOUT_MS = 10_000;

type Config = {
  baseUrl?: string;
  domainTokenSecret?: string;
  domainUrl?: string;
  fallbackValidator?: IRefepsValidator;
  refepsId?: string;
};
type Identifier = { system?: string; value?: string; assigner?: { display?: string } };
type Qualification = {
  code?: { text?: string; coding?: Array<{ system?: string; code?: string; display?: string }> };
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

function fail(code: string, upstreamStatus?: number): never {
  // Never include upstream bodies: authentication responses can contain secrets.
  throw Object.assign(new Error(code), { code, upstreamStatus });
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
    const refepsId = this.config.refepsId?.trim();
    // A registration number is not a federal REFEPS identifier. Never substitute it.
    if (!refepsId || !/^\d{1,12}$/.test(refepsId)) fail('REFEPS_ID_REQUIRED');
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
    const cleanLicense = (value: string): string => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const qualifications = practitioner.qualification ?? [];
    const license = qualifications.find((q) => q.identifier?.some((i) => {
      if (!i.value || cleanLicense(i.value) !== cleanLicense(matricula)) return false;
      const issuer = normalized(i.assigner?.display ?? '');
      if (type === 'MN') return issuer === 'ministerio de salud de la nacion';
      const jurisdiction = normalized(province ?? '');
      // Exact recognized issuers only: CABA also contains the words Buenos Aires.
      return !!jurisdiction && [
        `ministerio de salud de la provincia de ${jurisdiction}`,
        `ministerio de salud de ${jurisdiction}`,
      ].includes(issuer);
    }) && q.code?.coding?.some((c) => c.system?.includes('/Profesiones_REFEPS') && c.code === '1'));
    if (!license) fail('REFEPS_LICENSE_MISMATCH');
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
