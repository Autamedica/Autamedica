import type { APIRoute } from 'astro';
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server';
import { unauthorized } from '@/lib/api-helpers';

export const POST: APIRoute = async ({ request, locals }) => {
  // Use session from middleware (already validated via getUser() + refreshed if needed)
  if (!locals.session) return unauthorized();

  const result = await handleCloudflareCallsProxy(request, {
    appId: import.meta.env.CLOUDFLARE_CALLS_APP_ID,
    appSecret: import.meta.env.CLOUDFLARE_CALLS_APP_SECRET,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
};
