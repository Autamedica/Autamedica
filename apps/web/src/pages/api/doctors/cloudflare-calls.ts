import type { APIRoute } from 'astro';
import { createServerClientFromRequest } from '@autamedica/auth/server';
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server';
import { unauthorized } from '@/lib/api-helpers';

export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClientFromRequest(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return unauthorized();
  }

  const result = await handleCloudflareCallsProxy(request, {
    appId: import.meta.env.CLOUDFLARE_CALLS_APP_ID,
    appSecret: import.meta.env.CLOUDFLARE_CALLS_APP_SECRET,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
};
