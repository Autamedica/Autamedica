import type { APIRoute } from 'astro';
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server';
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth';
import { resolveCloudflareCallsEnv } from '@/lib/runtime-env';

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const { appId, appSecret } = resolveCloudflareCallsEnv(locals.runtime?.env);
  const result = await handleCloudflareCallsProxy(request, {
    appId,
    appSecret,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
};
