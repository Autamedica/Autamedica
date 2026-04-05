import type { APIRoute } from 'astro';
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server';
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth';

export const POST: APIRoute = async ({ request }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES);
  if (!isAuthed(auth)) return auth;

  const result = await handleCloudflareCallsProxy(request, {
    appId: import.meta.env.CLOUDFLARE_CALLS_APP_ID,
    appSecret: import.meta.env.CLOUDFLARE_CALLS_APP_SECRET,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
};
