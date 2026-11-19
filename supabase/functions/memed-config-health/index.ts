const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

/**
 * Server-to-server diagnostics only. The admin API invokes this with the
 * Supabase service-role client; the response contains booleans only.
 */
Deno.serve((request: Request): Response => {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authorization = request.headers.get('Authorization') ?? '';
  const apiKey = request.headers.get('apikey') ?? '';
  const bearer = authorization.replace(/^Bearer\s+/i, '');

  if (!serviceRoleKey || bearer !== serviceRoleKey || apiKey !== serviceRoleKey) {
    return json({ error: 'unauthorized' }, 401);
  }

  return json({
    flags: {
      MEMED_RX_ENABLED: Deno.env.get('MEMED_RX_ENABLED') === 'true',
      MEMED_MOBILE_ENABLED: Deno.env.get('MEMED_MOBILE_ENABLED') === 'true',
    },
    source: 'supabase_edge_runtime',
  });
});
