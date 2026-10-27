/**
 * FirmAR (Argentina) API transport based on the published SIU-Araí integration
 * contract. Preparing a signing request is NOT applying a signature.
 *
 * Production use requires institutional API credentials, approved callback
 * registration, per-document medical professional authorization, and independent
 * cryptographic verification of returned signed PDF bytes.
 *
 * Reference: https://documentacion.siu.edu.ar/documentos/docs/1.8.1/firmar-implementacion/
 */
export interface FirmarApiConfig {
  baseUrl: string;
  apiUser: string;
  apiSecret: string;
}

export interface FirmarSignRequest {
  /** Professional's verified Argentinian CUIL: 11 numeric digits. */
  doctorCuil: string;
  /** Unsigned PDF; its clinical content must be authorized by the doctor. */
  pdfBytes: Uint8Array;
  /** Cryptographically unpredictable, single-use server-created request ID. */
  requestToken: string;
  /** Preapproved AutaMedica HTTPS return URL (not user input). */
  returnUrl: string;
}

export interface FirmarSigningSession {
  /** FirmAR URL to open for the doctor to authorize the signature. */
  authorizationUrl: string;
  /** Correlation token; must be checked against a pending DB session. */
  requestToken: string;
  /** Signature has NOT yet happened. */
  status: 'awaiting_doctor_authorization';
}

const HOSTS = new Set(['firmar.gob.ar', 'tst.firmar.gob.ar']);

function apiOrigin(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('firmar_origin_not_allowed');
  }
  return url.origin;
}

export function validateDoctorCuil(input: string): string {
  const digits = input.replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(digits)) throw new Error('firmar_doctor_cuil_invalid');
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((n, w, i) => n + w * Number(digits[i]), 0);
  const check = 11 - (sum % 11);
  if (check === 10 || (check === 11 ? 0 : check) !== Number(digits[10])) {
    throw new Error('firmar_doctor_cuil_checksum_invalid');
  }
  return digits;
}

function base64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(result);
}

function authHeader(username: string, secret: string): string {
  return 'Basic ' + base64(new TextEncoder().encode(username + ':' + secret));
}

export class FirmarRemoteClient {
  private readonly origin: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: FirmarApiConfig, fetcher: typeof fetch = fetch) {
    this.origin = apiOrigin(config.baseUrl);
    if (!config.apiUser || !config.apiSecret) throw new Error('firmar_credentials_missing');
    this.fetcher = fetcher;
  }

  async createSigningSession(input: FirmarSignRequest): Promise<FirmarSigningSession> {
    const verifiedCuil = validateDoctorCuil(input.doctorCuil);
    if (input.pdfBytes.length < 5 || input.pdfBytes.length > 8 * 1024 * 1024 ||
        !new TextDecoder().decode(input.pdfBytes.subarray(0, 5)).startsWith('%PDF-')) {
      throw new Error('firmar_document_not_pdf');
    }
    if (!/^[A-Za-z0-9_-]{32,160}$/.test(input.requestToken)) {
      throw new Error('firmar_request_token_invalid');
    }
    const returnUrl = new URL(input.returnUrl);
    if (returnUrl.protocol !== 'https:' || returnUrl.username || returnUrl.password ||
        returnUrl.hash || !['autamedica.com', 'www.autamedica.com'].includes(returnUrl.hostname)) {
      throw new Error('firmar_return_url_not_allowed');
    }

    // SIU integration contract: OAuth client_credentials with HTTP Basic.
    const tokenResp = await this.fetcher(new URL('/ra/oauth/token', this.origin), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: authHeader(this.config.apiUser, this.config.apiSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenResp.ok) throw new Error('firmar_auth_failed');
    const tokenJson: unknown = await tokenResp.json();
    const accessToken = (tokenJson as { access_token?: unknown })?.access_token;
    if (typeof accessToken !== 'string' || accessToken.length < 8) {
      throw new Error('firmar_access_token_missing');
    }

    const docResp = await this.fetcher(new URL('/firmador/api/signatures', this.origin), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cuil: verifiedCuil,
        metadata: { tipo: 'firmar', token: input.requestToken },
        urlRedirect: returnUrl.href,
        type: 'PDF',
        documento: base64(input.pdfBytes),
      }),
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });

    if (docResp.status !== 200 && docResp.status !== 201) {
      throw new Error('firmar_request_rejected');
    }
    const location = docResp.headers.get('Location');
    if (!location) throw new Error('firmar_authorization_url_missing');
    const redirect = new URL(location, this.origin);
    if (redirect.protocol !== 'https:' || redirect.origin !== this.origin ||
        !(redirect.pathname.startsWith('/firmador/') || redirect.pathname.startsWith('/api/signatures/')) || redirect.username || redirect.password) {
      throw new Error('firmar_authorization_url_untrusted');
    }
    return {
      authorizationUrl: redirect.href,
      requestToken: input.requestToken,
      status: 'awaiting_doctor_authorization',
    };
  }
}
