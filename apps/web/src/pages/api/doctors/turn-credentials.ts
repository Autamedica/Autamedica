import type { APIRoute } from 'astro';
import { handleTurnCredentials } from '@autamedica/telemedicine/server';
import { resolveCloudflareCallsEnv } from '@/lib/runtime-env';
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth';

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const { turnKeyId, turnToken } = resolveCloudflareCallsEnv(locals.runtime?.env);
  const result = await handleTurnCredentials({
    keyId: turnKeyId,
    token: turnToken,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
};
