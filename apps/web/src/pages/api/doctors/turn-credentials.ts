import type { APIRoute } from 'astro';
import { handleTurnCredentials } from '@autamedica/telemedicine/server';
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth';

export const GET: APIRoute = async ({ request }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES);
  if (!isAuthed(auth)) return auth;

  const result = await handleTurnCredentials({
    keyId: import.meta.env.CLOUDFLARE_CALLS_TURN_KEY_ID,
    token: import.meta.env.CLOUDFLARE_CALLS_TURN_TOKEN,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
};
