import { createHmac } from 'node:crypto';

/**
 * Genera una client assertion JWT para el flujo EHR Auth de RNDS.
 * En homologación/producción el signer es un callback provisto por la
 * aplicación desde el certificado ICP-Brasil (RS256). Este helper soporta
 * HMAC para ambientes de prueba internos (HOM sin credencial real).
 */
export type ClientAssertionSigner = (claims: {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
}) => Promise<string> | string;

export function base64url(value: string | Buffer): string {
  const base64 = typeof value === 'string' ? Buffer.from(value).toString('base64') : value.toString('base64');
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function buildJwt(headers: Record<string, unknown>, payload: Record<string, unknown>): string {
  const encodedHeader = base64url(JSON.stringify(headers));
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}`;
}

export function signHmacAssertion(secret: string): ClientAssertionSigner {
  return (claims) => {
    const token = buildJwt({ typ: 'JWT', alg: 'HS256' }, claims);
    const hmac = createHmac('sha256', secret);
    hmac.update(token);
    return `${token}.${base64url(hmac.digest())}`;
  };
}

export function buildClientAssertions(issuer: string, audience: string, ttlSeconds = 300): {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
} {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  return {
    iss: issuer,
    sub: issuer,
    aud: audience,
    iat: currentTimestamp,
    exp: currentTimestamp + ttlSeconds,
  };
}