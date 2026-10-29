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

  // Memed's documented drug-ingredient lookup accepts partner keys in query
  // parameters. Only a fixed host and read-only path are allowed.
  const url = new URL('https://api.memed.com.br/v1/drugs/ingredients');
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('secret-key', secretKey);
  url.searchParams.set('terms', 'dipirona');
  url.searchParams.set('limit', '1');

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/vnd.api+json', 'Cache-Control': 'no-cache' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    // Do not return any provider response body or secret to the caller.
    return jsonOk({ provider: 'memed', environment: 'production',
      credentialsAccepted: response.ok, providerStatus: response.status });
  } catch {
    return serviceUnavailable('memed_provider_unreachable');
  }
};
