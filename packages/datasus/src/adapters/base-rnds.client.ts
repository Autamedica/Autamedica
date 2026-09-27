import type { DatasusResolvedConfig } from '../config';
import type { RndsDomain, RndsSendResult } from '../types/evidence.types';
import type { ClientAssertionSigner } from './assertion';
import { buildClientAssertions } from './assertion';

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
}

const DEFAULT_SCOPE = 'abacate';

export class RndsOfflineError extends Error {
  constructor(reason = 'RNDS credentials not configured') {
    super(`rnds_offline:${reason}`);
    this.name = 'RndsOfflineError';
  }
}

export class RndsHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `RNDS HTTP error ${status}`);
    this.name = 'RndsHttpError';
  }
}

export interface BaseRndsClientOptions {
  config: DatasusResolvedConfig;
  fetchImpl?: typeof fetch;
  signer?: ClientAssertionSigner;
}

const MIN_TOKEN_TTL_MS = 30_000;

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class BaseRndsClient {
  private readonly config: DatasusResolvedConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly signer?: ClientAssertionSigner;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(options: BaseRndsClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.signer = options.signer;
  }

  getConfig(): DatasusResolvedConfig {
    return this.config;
  }

  private assertConfigured(): void {
    if (!this.config.enabled) throw new RndsOfflineError('DATASUS_ENABLED=false');
    if (this.config.missing.length > 0) {
      throw new RndsOfflineError(`missing:${this.config.missing.join(',')}`);
    }
    if (!this.signer) throw new RndsOfflineError('missing client assertion signer');
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(joinUrl(this.config.baseUrl, path), init);
    const body = await parseJson(response);
    if (!response.ok) throw new RndsHttpError(response.status, body);
    return body as T;
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + MIN_TOKEN_TTL_MS) {
      return this.tokenCache.token;
    }

    this.assertConfigured();
    const signer = this.signer;
    if (!signer) throw new RndsOfflineError('missing client assertion signer');
    const claims = buildClientAssertions(this.config.cnes, joinUrl(this.config.baseUrl, this.config.tokenPath));
    const clientAssertion = await signer(claims);

    const body = await this.requestJson<OAuthTokenResponse>(this.config.tokenPath, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: DEFAULT_SCOPE,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion,
      }).toString(),
    });

    if (!body.access_token) {
      throw new RndsHttpError(200, body, 'RNDS token response missing access_token');
    }

    this.tokenCache = {
      token: body.access_token,
      expiresAt: Date.now() + Math.max(60_000, (body.expires_in ?? 0) - 60) * 1000,
    };
    return body.access_token;
  }

  /**
   * Envia un documento FHIR (Bundle/Resource) a la RNDS via /token + /fhir/r4.
   * Si la configuracion esta apagada, lanza RndsOfflineError para que el
   * orquestador registre evidencia offline_mock sin bloquear la atencion.
   */
  async sendDocument(document: unknown, _domain: RndsDomain): Promise<RndsSendResult> {
    this.assertConfigured();
    const token = await this.getAccessToken();

    const resourceType = (document as { resourceType?: string })?.resourceType ?? 'Bundle';
    const path = `${this.config.fhirBasePath}/${resourceType}`;

    const body = await this.requestJson<unknown>(
      path,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/fhir+json',
        },
        body: JSON.stringify(document),
      },
    );

    const wrapped = body as {
      resourceType?: string;
      status?: string;
      id?: string;
      entry?: Array<{ response?: { status?: string; location?: string } }>;
    };

    const identifiers = (body as { identifier?: Array<{ value?: string }> })?.identifier;
    const rndsIdentifier =
      wrapped?.id ||
      identifiers?.[0]?.value ||
      wrapped?.entry?.[0]?.response?.location?.split('/').pop();

    const fallbackStatus = wrapped?.resourceType === 'OperationOutcome' ? 'reported' : 'approved';

    return {
      status: (wrapped?.status as 'reported' | 'approved' | undefined) ?? fallbackStatus,
      rndsIdentifier,
      raw: body,
    };
  }
}