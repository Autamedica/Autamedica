import {
  resolvePublicSupabaseEnv,
  resolveServiceRoleKey,
  resolveBusNonFhirApplicationName,
  resolveBusNonFhirDomainCode,
  resolveBusNonFhirPassword,
} from '@/lib/runtime-env';

type RuntimeEnvRecord = Record<string, unknown> | null | undefined;

const BUS_BASE_URL = 'https://bus.msal.gob.ar/masterfile-federacion-service/api';

export type RenaperSexId = 1 | 2 | 3;

export interface RenaperPersonResult {
  idtramiteprincipal: number | null;
  idtramitetarjetareimpresa: number | null;
  ejemplar: string | null;
  vencimiento: string | null;
  emision: string | null;
  apellido: string | null;
  nombres: string | null;
  fechaNacimiento: string | null;
  cuil: string | null;
  calle: string | null;
  numero: string | null;
  piso: string | null;
  departamento: string | null;
  cpostal: string | null;
  barrio: string | null;
  monoblock: string | null;
  ciudad: string | null;
  municipio: string | null;
  provincia: string | null;
  pais: string | null;
  mensaf: string | null;
  origenf: string | null;
  fechaf: string | null;
  foto: string | null;
  sexo: string | null;
  numeroDocumento: string | null;
  fechaConsulta: string | null;
  idciudadano: string | null;
  descripcionError: string | null;
  codigoError: number | null;
}

export interface PucoCoverageResult {
  rnos?: string | null;
  cobertura?: string | null;
  servicio?: string | null;
  fechaConsulta?: string | null;
}

export interface OfficialIdentityResult {
  person: RenaperPersonResult;
  coverages: PucoCoverageResult[];
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizePerson(raw: unknown): RenaperPersonResult {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    idtramiteprincipal: asNumber(value.idtramiteprincipal),
    idtramitetarjetareimpresa: asNumber(value.idtramitetarjetareimpresa),
    ejemplar: asText(value.ejemplar),
    vencimiento: asText(value.vencimiento),
    emision: asText(value.emision),
    apellido: asText(value.apellido),
    nombres: asText(value.nombres),
    fechaNacimiento: asText(value.fechaNacimiento),
    cuil: asText(value.cuil),
    calle: asText(value.calle),
    numero: asText(value.numero),
    piso: asText(value.piso),
    departamento: asText(value.departamento),
    cpostal: asText(value.cpostal),
    barrio: asText(value.barrio),
    monoblock: asText(value.monoblock),
    ciudad: asText(value.ciudad),
    municipio: asText(value.municipio),
    provincia: asText(value.provincia),
    pais: asText(value.pais),
    mensaf: asText(value.mensaf),
    origenf: asText(value.origenf),
    fechaf: asText(value.fechaf),
    foto: asText(value.foto),
    sexo: asText(value.sexo),
    numeroDocumento: asText(value.numeroDocumento),
    fechaConsulta: asText(value.fechaConsulta),
    idciudadano: asText(value.idciudadano),
    descripcionError: asText(value.descripcionError),
    codigoError: asNumber(value.codigoError),
  };
}

function normalizeCoverages(raw: unknown): PucoCoverageResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      rnos: asText(value.rnos),
      cobertura: asText(value.cobertura),
      servicio: asText(value.servicio),
      fechaConsulta: asText(value.fechaConsulta),
    };
  });
}

function requireConfig(runtimeEnv?: RuntimeEnvRecord): {
  applicationName: string;
  password: string;
  domainCode: string;
} {
  const applicationName = resolveBusNonFhirApplicationName(runtimeEnv);
  const password = resolveBusNonFhirPassword(runtimeEnv);
  const domainCode = resolveBusNonFhirDomainCode(runtimeEnv);

  if (!applicationName || !password || !domainCode) {
    throw Object.assign(new Error('bus_non_fhir_credentials_missing'), {
      code: 'BUS_NON_FHIR_CREDENTIALS_MISSING',
    });
  }

  return { applicationName, password, domainCode };
}

function hasDirectBusConfig(runtimeEnv?: RuntimeEnvRecord): boolean {
  return Boolean(
    resolveBusNonFhirApplicationName(runtimeEnv) &&
    resolveBusNonFhirPassword(runtimeEnv) &&
    resolveBusNonFhirDomainCode(runtimeEnv)
  );
}

async function readJsonOrNull(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

export async function getNonFhirAccessToken(runtimeEnv?: RuntimeEnvRecord): Promise<{
  token: string;
  domainCode: string;
}> {
  const config = requireConfig(runtimeEnv);
  const response = await fetch(`${BUS_BASE_URL}/usuarios/aplicacion/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: config.applicationName,
      clave: config.password,
      codDominio: config.domainCode,
    }),
  });

  const payload = await readJsonOrNull(response);
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw Object.assign(new Error('bus_non_fhir_login_failed'), {
      code: 'BUS_NON_FHIR_LOGIN_FAILED',
      status: response.status,
    });
  }

  const token = asText((payload as Record<string, unknown>).token);
  if (!token) {
    throw Object.assign(new Error('bus_non_fhir_token_missing'), {
      code: 'BUS_NON_FHIR_TOKEN_MISSING',
    });
  }

  return { token, domainCode: config.domainCode };
}

export async function fetchOfficialIdentity(input: {
  dni: string;
  sexId: RenaperSexId;
  runtimeEnv?: RuntimeEnvRecord;
}): Promise<OfficialIdentityResult> {
  if (!hasDirectBusConfig(input.runtimeEnv)) {
    return fetchOfficialIdentityViaSupabase(input);
  }

  const { token, domainCode } = await getNonFhirAccessToken(input.runtimeEnv);
  const query = `nroDocumento=${encodeURIComponent(input.dni)}&idSexo=${input.sexId}`;
  const headers = {
    token,
    codDominio: domainCode,
    Accept: 'application/json',
  };

  const personResponse = await fetch(`${BUS_BASE_URL}/personas/renaper?${query}`, { headers });
  if (personResponse.status === 204) {
    throw Object.assign(new Error('renaper_person_not_found'), {
      code: 'RENAPER_PERSON_NOT_FOUND',
      status: personResponse.status,
    });
  }

  const personPayload = await readJsonOrNull(personResponse);
  if (!personResponse.ok) {
    throw Object.assign(new Error('renaper_lookup_failed'), {
      code: 'RENAPER_LOOKUP_FAILED',
      status: personResponse.status,
    });
  }

  const coverageResponse = await fetch(`${BUS_BASE_URL}/personas/cobertura?${query}`, { headers });
  const coveragePayload = coverageResponse.status === 204 ? null : await readJsonOrNull(coverageResponse);
  const coverages = coverageResponse.ok ? normalizeCoverages(coveragePayload) : [];

  return {
    person: normalizePerson(personPayload),
    coverages,
  };
}


/**
 * Cloudflare Patients does not have BUS login credentials. Use the existing
 * protected Supabase Edge Function with the service-role key ONLY on server.
 * Never return that key to a caller or include it in a log/error payload.
 */
async function fetchOfficialIdentityViaSupabase(input: {
  dni: string;
  sexId: RenaperSexId;
  runtimeEnv?: RuntimeEnvRecord;
}): Promise<OfficialIdentityResult> {
  const { publicSupabaseUrl } = resolvePublicSupabaseEnv(input.runtimeEnv);
  const key = resolveServiceRoleKey(input.runtimeEnv);
  const projectHost = 'qxjjrpksmwwrmubhvjew.supabase.co';
  let target: URL;
  try {
    target = new URL(publicSupabaseUrl);
  } catch {
    throw Object.assign(new Error('invalid_supabase_proxy_configuration'), {
      code: 'BUS_NON_FHIR_SUPABASE_CREDENTIALS_MISSING',
    });
  }

  // Do not send privileged credentials to an unexpected project or URL.
  if (!key || target.protocol !== 'https:' || target.hostname !== projectHost ||
      target.username || target.password || target.pathname !== '/' ||
      target.search || target.hash) {
    throw Object.assign(new Error('invalid_supabase_proxy_configuration'), {
      code: 'BUS_NON_FHIR_SUPABASE_CREDENTIALS_MISSING',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response: Response;
  try {
    response = await fetch(
      `${target.origin}/functions/v1/patient-identity-renaper`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dni: input.dni, sexId: input.sexId }),
        signal: controller.signal,
      },
    );
  } catch {
    throw Object.assign(new Error('renaper_proxy_unavailable'), {
      code: 'RENAPER_PROXY_UNAVAILABLE',
    });
  } finally {
    clearTimeout(timer);
  }

  const payload = await readJsonOrNull(response);
  const envelope = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  if (!response.ok || envelope.success !== true) {
    const allowedCodes = new Set([
      'RENAPER_PERSON_NOT_FOUND', 'BUS_NON_FHIR_CREDENTIALS_MISSING',
      'RENAPER_LOOKUP_FAILED', 'BUS_NON_FHIR_LOGIN_FAILED',
    ]);
    const sourceCode = typeof envelope.code === 'string' ? envelope.code : null;
    const code = sourceCode && allowedCodes.has(sourceCode) ? sourceCode : 'RENAPER_LOOKUP_FAILED';
    throw Object.assign(new Error('renaper_proxy_error'), {
      code,
      status: response.status,
    });
  }

  const data = envelope.data && typeof envelope.data === 'object'
    ? envelope.data as Record<string, unknown>
    : {};
  return {
    person: normalizePerson(data.person),
    coverages: normalizeCoverages(data.coverages),
  };
}
