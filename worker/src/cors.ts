export function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Upgrade, Connection',
    'Access-Control-Max-Age': '86400',
  }
}

export function corsResponse(origin?: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}
