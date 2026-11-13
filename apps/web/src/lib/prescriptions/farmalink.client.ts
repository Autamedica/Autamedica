import { getServerEnvOrDefault } from '@autamedica/shared';
import { getRuntimeEnvValue } from '@/lib/runtime-env';
import type {
  FarmalinkAltaRecetaRequest,
  FarmalinkAltaRecetaResponse,
  FarmalinkAltaResult,
  FarmalinkBajaRecetaRequest,
  FarmalinkClientConfig,
  FarmalinkConsultaRecetaRequest,
  FarmalinkResolvedConfig,
  FarmalinkTokenResponse,
} from './farmalink.types';

type RuntimeEnvRecord = Record<string, unknown> | null | undefined;

export class FarmalinkHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message = `Farmalink HTTP error ${status}`,
  ) {
    super(message);
    this.name = 'FarmalinkHttpError';
  }
}

function readRuntimeString(source: RuntimeEnvRecord, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readEnv(source: RuntimeEnvRecord, key: string, defaultValue?: string): string | undefined {
  return readRuntimeString(source, key)
    ?? getRuntimeEnvValue(key)
    ?? getServerEnvOrDefault(key, defaultValue);
}

function readEnabled(source: RuntimeEnvRecord): boolean {
  return ['true', '1', 'yes', 'si', 'sí'].includes(
    (readEnv(source, 'FARMALINK_ENABLED', 'false') ?? '').trim().toLowerCase(),
  );
}

export function resolveFarmalinkConfig(runtimeEnv?: RuntimeEnvRecord): FarmalinkResolvedConfig {
  const config = {
    enabled: readEnabled(runtimeEnv),
    baseUrl: readEnv(runtimeEnv, 'FARMALINK_BASE_URL', 'https://test-servicios.farmalink.com.ar'),
    tokenPath: readEnv(runtimeEnv, 'FARMALINK_TOKEN_PATH', '/api/oauth/token/generate'),
    recetaBasePath: readEnv(runtimeEnv, 'FARMALINK_RECETA_BASE_PATH', '/api/recetaElect/v3'),
    oauthUsername: readEnv(runtimeEnv, 'FARMALINK_OAUTH_USERNAME'),
    oauthPassword: readEnv(runtimeEnv, 'FARMALINK_OAUTH_PASSWORD'),
    basicUser: readEnv(runtimeEnv, 'FARMALINK_BASIC_USER'),
    basicPassword: readEnv(runtimeEnv, 'FARMALINK_BASIC_PASSWORD'),
    scope: readEnv(runtimeEnv, 'FARMALINK_SCOPE', 'Switch.RecetaElectRest'),
    grantType: readEnv(runtimeEnv, 'FARMALINK_GRANT_TYPE', 'PASSWORD'),
  };

  const missing = [
    ['FARMALINK_BASE_URL', config.baseUrl],
    ['FARMALINK_TOKEN_PATH', config.tokenPath],
    ['FARMALINK_RECETA_BASE_PATH', config.recetaBasePath],
    ['FARMALINK_OAUTH_USERNAME', config.oauthUsername],
    ['FARMALINK_OAUTH_PASSWORD', config.oauthPassword],
    ['FARMALINK_BASIC_USER', config.basicUser],
    ['FARMALINK_BASIC_PASSWORD', config.basicPassword],
    ['FARMALINK_SCOPE', config.scope],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return { ...config, missing };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function basicAuth(user: string, password: string): string {
  const raw = `${user}:${password}`;
  if (typeof btoa === 'function') {
    return btoa(raw);
  }

  return Buffer.from(raw, 'utf8').toString('base64');
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function requireConfig(config: FarmalinkResolvedConfig): FarmalinkClientConfig {
  if (config.missing.length > 0) {
    throw new Error(`farmalink_missing_config:${config.missing.join(',')}`);
  }

  return config as FarmalinkClientConfig;
}

export function extractFarmalinkAltaResult(raw: FarmalinkAltaRecetaResponse): FarmalinkAltaResult {
  const response = raw.altaRecetaElectRs;
  const respuesta = response?.respuesta;
  const nroRecElectronica = response?.recElectronica?.nroRecElectronica?.trim();

  return {
    approved: (respuesta?.codigo === '00' || respuesta?.codigo === '0') && Boolean(nroRecElectronica),
    responseCode: respuesta?.codigo,
    responseDescription: respuesta?.descripcion,
    reference: respuesta?.referencia,
    nroRecElectronica,
    raw,
  };
}

export class FarmalinkClient {
  private readonly fetchImpl: typeof fetch;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: FarmalinkClientConfig) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  static fromEnv(runtimeEnv?: RuntimeEnvRecord): FarmalinkClient | null {
    const resolved = resolveFarmalinkConfig(runtimeEnv);
    if (!resolved.enabled) return null;
    return new FarmalinkClient(requireConfig(resolved));
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    // Never forward OAuth/password headers or bearer tokens through HTTP redirects.
    // A redirect should be investigated explicitly rather than followed by this client.
    const response = await this.fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000), redirect: 'error' });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new FarmalinkHttpError(response.status, body);
    }

    return body as T;
  }

  async generateAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 30_000) {
      return this.tokenCache.token;
    }

    const body = await this.requestJson<FarmalinkTokenResponse>(
      joinUrl(this.config.baseUrl, this.config.tokenPath),
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth(this.config.basicUser, this.config.basicPassword)}`,
          grant_type: this.config.grantType ?? 'PASSWORD',
          username: this.config.oauthUsername,
          password: this.config.oauthPassword,
          scope: this.config.scope,
        },
      },
    );

    if (!body.access_token) {
      throw new Error('farmalink_token_missing_access_token');
    }

    this.tokenCache = {
      token: body.access_token,
      expiresAt: now + Math.max(0, (body.expires_in ?? 0) - 60) * 1000,
    };

    return body.access_token;
  }

  async altaReceta(request: FarmalinkAltaRecetaRequest): Promise<FarmalinkAltaResult> {
    const accessToken = await this.generateAccessToken();
    const raw = await this.requestJson<FarmalinkAltaRecetaResponse>(
      joinUrl(this.config.baseUrl, `${this.config.recetaBasePath}/altaReceta`),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      },
    );

    return extractFarmalinkAltaResult(raw);
  }

  async consultaReceta(request: FarmalinkConsultaRecetaRequest): Promise<unknown> {
    const accessToken = await this.generateAccessToken();
    return this.requestJson(
      joinUrl(this.config.baseUrl, `${this.config.recetaBasePath}/consultaReceta`),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      },
    );
  }

  async bajaReceta(request: FarmalinkBajaRecetaRequest): Promise<unknown> {
    const accessToken = await this.generateAccessToken();
    return this.requestJson(
      joinUrl(this.config.baseUrl, `${this.config.recetaBasePath}/bajaReceta`),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      },
    );
  }
}

