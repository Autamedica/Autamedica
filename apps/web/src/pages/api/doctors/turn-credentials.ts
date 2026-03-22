import type { APIRoute } from 'astro';
import { handleTurnCredentials } from '@autamedica/telemedicine/server';

export const GET: APIRoute = async () => {
  const result = await handleTurnCredentials({
    keyId: import.meta.env.CLOUDFLARE_CALLS_TURN_KEY_ID,
    token: import.meta.env.CLOUDFLARE_CALLS_TURN_TOKEN,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
};
