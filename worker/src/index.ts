import { SignalingRoom } from './signaling-room'
import { GeminiLiveRoom } from './gemini-live-room'
import { corsHeaders, corsResponse } from './cors'
import type { Env } from './types'

// Re-export Durable Object classes (required by Wrangler)
export { SignalingRoom, GeminiLiveRoom }

function json(payload: unknown, status: number, origin?: string | null): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    if (request.method === 'OPTIONS') {
      return corsResponse(origin)
    }

    // Health check
    if (url.pathname === '/health') {
      return json(
        {
          status: 'ok',
          service: 'autamedica-signaling-server',
          mode: 'websocket-durable-objects',
          timestamp: new Date().toISOString(),
        },
        200,
        origin
      )
    }

    // Gemini Live API proxy: /gemini-live?sessionId=xxx
    if (url.pathname === '/gemini-live') {
      const sessionId = url.searchParams.get('sessionId')
      if (!sessionId) {
        return json({ type: 'error', data: 'Missing sessionId query parameter' }, 400, origin)
      }
      const doId = env.GEMINI_LIVE_ROOM.idFromName(sessionId)
      const stub = env.GEMINI_LIVE_ROOM.get(doId)
      return stub.fetch(request)
    }

    // WebSocket signaling: /signaling (primary) and /connect (legacy)
    if (url.pathname === '/signaling' || url.pathname === '/connect') {
      const roomId = url.searchParams.get('roomId')
      if (!roomId) {
        return json({ type: 'error', data: 'Missing roomId query parameter' }, 400, origin)
      }

      // Route to the Durable Object for this room
      const doId = env.SIGNALING_ROOM.idFromName(roomId)
      const stub = env.SIGNALING_ROOM.get(doId)
      return stub.fetch(request)
    }

    // Info endpoint
    if (url.pathname === '/') {
      return json(
        {
          service: 'autamedica-signaling-server',
          endpoints: {
            '/signaling?roomId=xxx': 'WebSocket signaling (primary)',
            '/connect?roomId=xxx': 'WebSocket signaling (legacy)',
            '/gemini-live?sessionId=xxx': 'Gemini Live API proxy (voice anamnesis)',
            '/health': 'Health check',
          },
        },
        200,
        origin
      )
    }

    return json({ error: 'Not found' }, 404, origin)
  },
} satisfies ExportedHandler<Env>
