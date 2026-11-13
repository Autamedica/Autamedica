import type { SupabaseClient } from '@supabase/supabase-js'
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'

interface ProxyEnv {
  appId: string | undefined
  appSecret: string | undefined
  bindingsEnabled: boolean
}

interface ProxyResult {
  status: number
  body: unknown
  headers?: Record<string, string>
}

type SfuPayload = {
  roomId?: unknown
  path?: unknown
  method?: unknown
  body?: unknown
}

const SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/
const SESSION_ACTION = /^sessions\/([A-Za-z0-9._-]{1,200})\/(tracks\/new|tracks\/close|renegotiate)$/

const deny = (status: number, error: string): ProxyResult => ({ status, body: { error } })

async function isJordanRoom(admin: SupabaseClient, roomId: string): Promise<boolean> {
  const { data: dispatch, error: dispatchError } = await admin
    .from('pharmacy_dispatch_requests')
    .select('referral_partner_id')
    .eq('cloudflare_room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (dispatchError) throw dispatchError
  if (!dispatch?.referral_partner_id) return false

  const { data: partner, error: partnerError } = await admin
    .from('commercial_referral_partners')
    .select('code')
    .eq('id', dispatch.referral_partner_id)
    .maybeSingle()
  if (partnerError || !partner) throw partnerError ?? new Error('unknown_referral_partner')
  return partner.code === 'JORDAN'
}

/**
 * All Cloudflare media operations must be preceded by the route's independent
 * patient/doctor/guest room authorization and Jordan PSP gate.
 *
 * When the new SFU binding flag is disabled, ordinary calls keep their
 * established path, but **paid Jordan** must fail closed. The flag may be
 * enabled only after its locked-down DB migration and synthetic E2E smoke.
 */
export async function handleRoomBoundCloudflareProxy(
  request: Request,
  admin: SupabaseClient,
  roomId: string,
  principalKey: string,
  env: ProxyEnv,
): Promise<ProxyResult> {
  if (!roomId || roomId.length > 200 ||
      !/^(user|guest):[A-Za-z0-9._-]{8,200}$/.test(principalKey)) {
    return deny(403, 'sfu_room_not_authorized')
  }

  let payload: SfuPayload
  try {
    payload = await request.clone().json() as SfuPayload
  } catch {
    return deny(400, 'invalid_sfu_request')
  }

  if (payload?.roomId !== roomId || typeof payload.path !== 'string') {
    return deny(403, 'sfu_room_mismatch')
  }

  try {
    const jordan = await isJordanRoom(admin, roomId)
    if (!env.bindingsEnabled) {
      if (jordan) return deny(503, 'jordan_sfu_session_binding_not_ready')
      return await handleCloudflareCallsProxy(request, env)
    }

    const path = payload.path
    const matched = SESSION_ACTION.exec(path)
    if (path !== 'sessions/new' && !matched) {
      return deny(400, 'sfu_operation_not_allowed')
    }

    if (matched) {
      const targetSession = matched[1]
      const { data: binding, error } = await admin
        .from('sfu_room_session_bindings')
        .select('room_id,principal_key')
        .eq('session_id', targetSession)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (error) throw error
      if (binding?.room_id !== roomId || binding?.principal_key !== principalKey) {
        return deny(403, 'sfu_session_owner_or_room_mismatch')
      }

      // When subscribing remote tracks, each peer's SFU session must belong
      // to the SAME authorized room; a caller may never attach another
      // room's tracks merely by guessing or receiving a session ID.
      if (matched[2] === 'tracks/new') {
        const body = payload.body as { tracks?: unknown } | null
        if (!Array.isArray(body?.tracks) || body.tracks.length > 32) {
          return deny(400, 'invalid_sfu_track_envelope')
        }

        const remoteSessions = new Set<string>()
        for (const track of body.tracks) {
          if (!track || typeof track !== 'object') {
            return deny(400, 'invalid_sfu_track')
          }
          const t = track as { location?: unknown; sessionId?: unknown }
          if (t.location === 'remote') {
            if (typeof t.sessionId !== 'string' || !SESSION_ID.test(t.sessionId)) {
              return deny(403, 'remote_sfu_session_required')
            }
            remoteSessions.add(t.sessionId)
          } else if (t.location !== 'local' || t.sessionId != null) {
            return deny(403, 'untrusted_local_sfu_track')
          }
        }

        if (remoteSessions.size) {
          const ids = [...remoteSessions]
          const { data: peers, error: peerError } = await admin
            .from('sfu_room_session_bindings')
            .select('session_id,room_id')
            .in('session_id', ids)
            .gt('expires_at', new Date().toISOString())
          if (peerError) throw peerError
          const allowed = new Set((peers ?? [])
            .filter((peer) => peer.room_id === roomId)
            .map((peer) => peer.session_id))
          if (ids.some((id) => !allowed.has(id))) {
            return deny(403, 'remote_sfu_room_mismatch')
          }
        }
      }
    }

    const result = await handleCloudflareCallsProxy(request, env)
    if (path !== 'sessions/new' || result.status < 200 || result.status >= 300) {
      return result
    }

    const returned = result.body as { sessionId?: unknown } | null
    const sessionId = returned?.sessionId
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
      return deny(502, 'sfu_session_identity_missing')
    }
    const { error: writeError } = await admin
      .from('sfu_room_session_bindings')
      .insert({ session_id: sessionId, room_id: roomId, principal_key: principalKey })
    if (writeError) throw writeError

    return result
  } catch {
    // Never return an unregistered session id or expose private DB details.
    return deny(503, 'sfu_session_binding_unavailable')
  }
}
