import type { APIRoute } from 'astro';
import { createServerClientFromRequest } from '@autamedica/auth/server';
import { handleTurnCredentials } from '@autamedica/telemedicine/server';
import { unauthorized } from '@/lib/api-helpers';

export const GET: APIRoute = async ({ request }) => {
  const supabase = createServerClientFromRequest(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return unauthorized();
  }

  const result = await handleTurnCredentials({
    keyId: import.meta.env.CLOUDFLARE_CALLS_TURN_KEY_ID,
    token: import.meta.env.CLOUDFLARE_CALLS_TURN_TOKEN,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
};
