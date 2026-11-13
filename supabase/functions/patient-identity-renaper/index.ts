const BUS_BASE_URL = 'https://bus.msal.gob.ar/masterfile-federacion-service/api';

type RenaperSexId = 1 | 2 | 3;

interface IdentityRequest {
  dni?: unknown;
  sexId?: unknown;
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDni(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 12 ? digits : null;
}

function normalizeSexId(value: unknown): RenaperSexId | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
}

function checkServiceRoleAuthorization(req: Request, getEnv: (name: string) => string | undefined): { authorized: boolean; error?: 'MISSING_ENV_KEY' | 'UNAUTHORIZED' } {
  const serviceRoleKey = getEnv(['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_'));
  if (!serviceRoleKey) {
    return { authorized: false, error: 'MISSING_ENV_KEY' };
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization || authorization !== `Bearer ${serviceRoleKey}`) {
    return { authorized: false, error: 'UNAUTHORIZED' };
  }

  return { authorized: true };
}

async function readJsonOrNull(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function normalizePerson(raw: unknown): Record<string, unknown> {
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

function normalizeCoverages(raw: unknown): Array<Record<string, string | null>> {
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

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: string | URL,
  init: RequestInit,
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw Object.assign(new Error('renaper_lookup_timeout'), {
        code: 'RENAPER_LOOKUP_TIMEOUT',
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(getEnv: (name: string) => string | undefined, fetcher: typeof fetch): Promise<{ token: string; domainCode: string }> {
  const applicationName = getEnv('BUS_INTEROP_NON_FHIR_APPLICATION_NAME');
  const password = getEnv('BUS_INTEROP_NON_FHIR_PASSWORD');
  const domainCode = getEnv('BUS_INTEROP_NON_FHIR_DOMAIN_CODE');

  if (!applicationName || !password || !domainCode) {
    throw Object.assign(new Error('bus_non_fhir_credentials_missing'), {
      code: 'BUS_NON_FHIR_CREDENTIALS_MISSING',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await fetcher(`${BUS_BASE_URL}/usuarios/aplicacion/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: applicationName,
        clave: password,
        codDominio: domainCode,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

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

    return { token, domainCode };
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      throw Object.assign(new Error('bus_non_fhir_login_timeout'), {
        code: 'BUS_NON_FHIR_LOGIN_TIMEOUT',
      });
    }
    throw error;
  }
}

export async function handleRequest(
  req: Request,
  dependencies: { getEnv?: (name: string) => string | undefined; fetcher?: typeof fetch } = {},
): Promise<Response> {
  const getEnv = dependencies.getEnv ?? ((name: string) => Deno.env.get(name));
  const fetcher = dependencies.fetcher ?? fetch;
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const auth = checkServiceRoleAuthorization(req, getEnv);
  if (!auth.authorized) {
    if (auth.error === 'MISSING_ENV_KEY') {
      return jsonResponse({ success: false, code: 'SUPABASE_SERVICE_ROLE_KEY_MISSING' }, 500);
    }
    return jsonResponse({ success: false, code: 'UNAUTHORIZED' }, 401);
  }

  const body = await req.json().catch(() => ({})) as IdentityRequest;
  const dni = normalizeDni(body.dni);
  const sexId = normalizeSexId(body.sexId);

  if (!dni || !sexId) {
    return jsonResponse({ success: false, code: 'VALIDATION' }, 400);
  }

  try {
    const { token, domainCode } = await getAccessToken(getEnv, fetcher);
    const query = `nroDocumento=${encodeURIComponent(dni)}&idSexo=${sexId}`;
    const headers = {
      token,
      codDominio: domainCode,
      Accept: 'application/json',
    };

    const personResponse = await fetchWithTimeout(fetcher, `${BUS_BASE_URL}/personas/renaper?${query}`, { headers });
    if (personResponse.status === 204) {
      return jsonResponse({ success: false, code: 'RENAPER_PERSON_NOT_FOUND' }, 404);
    }

    const personPayload = await readJsonOrNull(personResponse);
    if (!personResponse.ok) {
      return jsonResponse(
        { success: false, code: 'RENAPER_LOOKUP_FAILED', status: personResponse.status },
        502,
      );
    }

    const coverageResponse = await fetchWithTimeout(fetcher, `${BUS_BASE_URL}/personas/cobertura?${query}`, { headers });
    const coveragePayload = coverageResponse.status === 204
      ? null
      : await readJsonOrNull(coverageResponse);

    return jsonResponse({
      success: true,
      data: {
        person: normalizePerson(personPayload),
        coverages: coverageResponse.ok ? normalizeCoverages(coveragePayload) : [],
      },
    });
  } catch (error) {
    const code = error instanceof Error
      ? (error as Error & { code?: string }).code
      : null;

    if (code === 'BUS_NON_FHIR_CREDENTIALS_MISSING') {
      return jsonResponse({ success: false, code }, 503);
    }

    if (code === 'BUS_NON_FHIR_LOGIN_TIMEOUT' || code === 'RENAPER_LOOKUP_TIMEOUT') {
      return jsonResponse({ success: false, code }, 504);
    }

    return jsonResponse({ success: false, code: code ?? 'INTERNAL' }, 500);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
