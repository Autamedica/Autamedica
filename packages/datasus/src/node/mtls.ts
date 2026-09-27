import { readFileSync } from 'node:fs';
import https from 'node:https';
import { logger } from '@autamedica/shared';

export interface MtlsFetchOptions {
  certPath: string;
  certPassword?: string;
}

/**
 * Fabrica un fetch con certificado de cliente ICP-Brasil (mutual TLS).
 * El .pfx del establecimiento se carga en un Agent de Node y se inyecta como
 * dispatcher de fetch (undici). Se usa solo desde codigo server-side.
 */
export function createMtlsFetch(options: MtlsFetchOptions): typeof fetch {
  const pfx = readFileSync(options.certPath);
  const agent = new https.Agent({
    pfx,
    passphrase: options.certPassword,
    rejectUnauthorized: true,
  });

  return (input, init) => {
    const requestInit = init ?? {};
    // undici: fetch(url, { dispatcher: Agent }); tipados de TS no lo exponen.
    return (globalThis.fetch as ReqDispatcherFetchMock)(
      input,
      { ...requestInit, dispatcher: agent } as RequestInit,
    );
  };
}

type ReqDispatcherFetchMock = (
  input: RequestInfo | URL,
  init?: RequestInit & { dispatcher?: unknown },
) => Promise<Response>;

/**
 * Returns true si el entorno puede usar mTLS (hay certificado y modulo https).
 */
export function isMtlsAvailable(): boolean {
  return typeof readFileSync === 'function' && process.versions.node !== undefined;
}

export function httpError(context: string, status: number, body: unknown): Error {
  const snippet =
    typeof body === 'string'
      ? body.slice(0, 400)
      : JSON.stringify(body)?.slice(0, 400) ?? '';

  logger.error(`[datasus] ${context} HTTP ${status}: ${snippet}`);
  return new Error(`${context} HTTP ${status}`);
}