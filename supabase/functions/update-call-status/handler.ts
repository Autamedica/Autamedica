interface ActorClient {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string } | null }
      error: unknown
    }>
  }
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { code?: string; message?: string } | null
  }>
}

interface Dependencies {
  createUserClient(authorization: string): ActorClient
  corsHeaders: Record<string, string>
}

const STATUSES = new Set(['requested', 'ringing', 'accepted', 'declined', 'canceled', 'connecting', 'connected', 'ended'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleUpdateCallStatus(req: Request, deps: Dependencies): Promise<Response> {
  const reply = (status: number, body: Record<string, unknown>): Response =>
    new Response(JSON.stringify(body), {
      status, headers: { ...deps.corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: deps.corsHeaders })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  const authorization = req.headers.get('Authorization')
  const match = authorization?.match(/^Bearer\s+(\S+)$/i)
  if (!authorization || !match) return reply(401, { error: 'authentication_required' })

  try {
    // This client retains the verified user's JWT for every database operation.
    // The RPC checks participation under auth.uid(); no service-role bypass exists here.
    const actor = deps.createUserClient(authorization)
    const { data: { user }, error: authError } = await actor.auth.getUser(match[1])
    if (authError || !user) return reply(401, { error: 'invalid_or_expired_token' })

    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply(400, { error: 'invalid_request' })
    }
    const { callId, status, reason } = body as Record<string, unknown>
    const normalized = status === 'in_progress' ? 'connected' : status === 'completed' ? 'ended' : status
    if (typeof callId !== 'string' || !UUID.test(callId)
      || typeof normalized !== 'string' || !STATUSES.has(normalized)
      || (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > 500))) {
      return reply(400, { error: 'invalid_call_status_request' })
    }

    const { data, error } = await actor.rpc('update_call_status', {
      p_call_id: callId, p_status: normalized, p_reason: reason ?? null,
    })
    if (error) {
      if (error.code === '42501') return reply(403, { error: 'call_access_denied' })
      if (['22000', '22023', '23514'].includes(error.code ?? '')) {
        return reply(409, { error: 'invalid_call_status_transition' })
      }
      return reply(500, { error: 'call_status_update_failed' })
    }
    return reply(200, { success: true, updated: data === true })
  } catch {
    return reply(500, { error: 'call_status_update_failed' })
  }
}
