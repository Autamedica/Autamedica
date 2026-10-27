/**
 * FirmAR/PFDR transport for an externally authorized integration.
 * Implements an initiation protocol documented by SIU (manual v1.3).
 * NOT active in production. Endpoint details must be checked against the
 * credentials and technical specification supplied by PFDR authorities.
 * The doctor must approve each signature in the government signer.
 */
export interface FirmArConfig {
  raBaseUrl: string;
  signerBaseUrl: string;
  apiUser: string;
  apiSecret: string;
  allowedRedirectOrigins: string[];
}

export interface FirmArInitiateInput {
  doctorCuil: string;
  pdf: Uint8Array;
  requestToken: string;
  redirectUrl: string;
}

export interface FirmArInitiateResult {
  authorizationUrl: string;
  requestToken: string;
}

function secureUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('firmar_https_url_required');
  }
  return url;
}

export function normalizeDoctorCuil(input: string): string {
  const digits = input.replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(digits)) throw new Error('firmar_invalid_doctor_cuil');
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((n, weight, i) => n + weight * Number(digits[i]), 0);
  const check = 11 - (sum % 11);
  if ((check === 10) || (check === 11 ? 0 : check) !== Number(digits[10])) {
    throw new Error('firmar_invalid_doctor_cuil_checksum');
  }
  return digits;
}

export function encodePdfForFirmAr(pdf: Uint8Array): string {
  if (pdf.byteLength < 5 || pdf.byteLength > 8 * 1024 * 1024 ||
      String.fromCharCode(...pdf.slice(0, 5)) !== '%PDF-') {
    throw new Error('firmar_invalid_pdf');
  }
  let chunks = '';
  for (let offset = 0; offset < pdf.length; offset += 16384) {
    chunks += String.fromCharCode(...pdf.subarray(offset, offset + 16384));
  }
  return btoa(chunks);
}

export class FirmArClient {
  private readonly raUrl: URL;
  private readonly signerUrl: URL;

  constructor(
    private readonly config: FirmArConfig,
    private readonly http: typeof fetch = fetch,
  ) {
    this.raUrl = secureUrl(config.raBaseUrl);
    this.signerUrl = secureUrl(config.signerBaseUrl);
    if (!config.apiUser || !config.apiSecret) throw new Error('firmar_api_credentials_missing');
    if (this.raUrl.search || this.signerUrl.search) throw new Error('firmar_base_url_query_forbidden');
  }

  async initiate(input: FirmArInitiateInput): Promise<FirmArInitiateResult> {
    const cuil = normalizeDoctorCuil(input.doctorCuil);
    if (!/^[a-zA-Z0-9_-]{22,128}$/.test(input.requestToken)) {
      throw new Error('firmar_request_token_invalid');
    }
    const redirect = secureUrl(input.redirectUrl);
    if (!this.config.allowedRedirectOrigins.includes(redirect.origin)) {
      throw new Error('firmar_unapproved_return_origin');
    }

    const documentBase64 = encodePdfForFirmAr(input.pdf);
    const tokenUrl = new URL('oauth/token', this.raUrl.href.replace(/\/?$/, '/'));
    tokenUrl.searchParams.set('grant_type', 'client_credentials');
    const encodedCredentials = btoa(this.config.apiUser + ':' + this.config.apiSecret);
    const authResponse = await this.http(tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: 'Basic ' + encodedCredentials },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!authResponse.ok) throw new Error('firmar_auth_http_' + authResponse.status);
    const tokenBody: unknown = await authResponse.json();
    const accessToken = (tokenBody as Record<string, unknown> | null)?.access_token;
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('firmar_access_token_missing');

    const signatureUrl = new URL('api/signatures', this.signerUrl.href.replace(/\/?$/, '/'));
    const response = await this.http(signatureUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        cuil,
        documento: documentBase64,
        type: 'PDF',
        metadata: { tipo: 'firmar', token: input.requestToken },
        urlRedirect: input.redirectUrl,
      }),
    });
    if (!response.ok) throw new Error('firmar_sign_request_http_' + response.status);
    const location = response.headers.get('location');
    if (!location) throw new Error('firmar_authorization_location_missing');
    const authorizationUrl = secureUrl(new URL(location, signatureUrl).href);
    if (authorizationUrl.origin !== this.signerUrl.origin) {
      throw new Error('firmar_untrusted_authorization_origin');
    }
    return { authorizationUrl: authorizationUrl.href, requestToken: input.requestToken };
  }
}
