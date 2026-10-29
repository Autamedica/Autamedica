/**
 * Read-only production credential smoke test for Memed.
 * Restricted to authenticated platform administrators. Does not create
 * a prescriber, prescription, patient record, or provider-side mutation.
 */
import type { APIRoute } from 'astro';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { jsonOk, serviceUnavailable } from '@/lib/api-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const env = locals.runtime?.env;
  const apiKey = env?.MEMED_API_KEY;
  const secretKey = env?.MEMED_SECRET_KEY;
  const apiBase = env?.MEMED_API_URL;
  if (typeof apiKey !== 'string' || !apiKey ||
      typeof secretKey !== 'string' || !secretKey ||
      apiBase !== 'https://api.memed.com.br/v1') {
    return serviceUnavailable('memed_production_configuration_incomplete');
  }

  // Memed's documented read-only key validation accepts partner keys in query
  // parameters. Only a fixed host and read-only path are allowed.
  const url = new URL('https://api.memed.com.br/v1/sinapse-prescricao/check-key');
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('secret-key', secretKey);


  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/vnd.api+json', 'Cache-Control': 'no-cache' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json() as { success?: Array<{ code?: unknown }> };
    const accepted = response.ok && Array.isArray(result.success)
      && result.success.some((entry) => entry.code === 'chave-valida');
    // Do not return any provider response body or secret to the caller.
    const health = jsonOk({ provider: 'memed', environment: 'production',
      credentialsAccepted: accepted, providerStatus: response.status,
      issuanceEnabled: env?.MEMED_RX_ENABLED === 'true',
      pilotConfigured: typeof env?.MEMED_PILOT_DOCTOR_ID === 'string',
      scriptConfigured: env?.MEMED_SCRIPT_URL === 'https://partners.memed.com.br/integration.js' });
    health.headers.set('Cache-Control', 'no-store, private');
    return health;
  } catch {
    return serviceUnavailable('memed_provider_unreachable');
  }
};

