import type { SupabaseClient } from '@supabase/supabase-js'

const SFU_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/
const SFU_SESSION_ACTION = /^sessions\/([A-Za-z0-9._-]{1,200})\/(tracks\/new|tracks\/close|renegotiate)$/

/**
 * Edge function's service-role connection uses the SAME RLS-restricted session
 * registry as Astro web. Authorization of the actual JWT user or signed guest
 * principal, and the actual room MUST occur in the calling handler first.
 * Returns false on unregistered, expired, cross-room or cross-owner sessions.
 */
export async function authorizeEdgeSfuBinding(
  admin: SupabaseClient,
  roomId: string,
  principalKey: string,
  path: string,
  body: unknown,
): Promise<boolean> {
  if (roomId.length < 1 || roomId.length > 200 ||
      !/^(user|guest):[A-Za-z0-9._-]{8,200}$/.test(principalKey)) return false
  if (path === 'sessions/new') return true
  const match = SFU_SESSION_ACTION.exec(path)
  if (!match) return false
  const sessionId = match[1]

  const { data: binding, error } = await admin
    .from('sfu_room_session_bindings')
    .select('room_id,principal_key')
    .eq('session_id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  if (!binding || binding.room_id !== roomId ||
      binding.principal_key !== principalKey) return false

  if (match[2] !== 'tracks/new') return true
  const tracks = (body as { tracks?: unknown } | null)?.tracks
  if (!Array.isArray(tracks) || tracks.length > 32) return false
  const remoteIds = new Set<string>()
  for (const track of tracks) {
    if (!track || typeof track !== 'object') return false
    const t = track as { location?: unknown; sessionId?: unknown }
    if (t.location === 'remote') {
      if (typeof t.sessionId !== 'string' || !SFU_SESSION_ID.test(t.sessionId)) return false
      remoteIds.add(t.sessionId)
    } else if (t.location !== 'local' || t.sessionId != null) {
      return false
    }
  }

  if (!remoteIds.size) return true
  const ids = [...remoteIds]
  const { data: peers, error: peersError } = await admin
    .from('sfu_room_session_bindings')
    .select('session_id,room_id')
    .in('session_id', ids)
    .gt('expires_at', new Date().toISOString())
  if (peersError) throw peersError
  const allowed = new Set((peers ?? [])
    .filter((peer) => peer.room_id === roomId)
    .map((peer) => peer.session_id))
  return ids.every((id) => allowed.has(id))
}

export async function recordEdgeSfuSession(
  admin: SupabaseClient,
  roomId: string,
  principalKey: string,
  upstream: unknown,
): Promise<boolean> {
  const sessionId = (upstream as { sessionId?: unknown } | null)?.sessionId
  if (!/^(user|guest):[A-Za-z0-9._-]{8,200}$/.test(principalKey) ||
      !roomId || typeof sessionId !== 'string' || !SFU_SESSION_ID.test(sessionId)) return false

  const { error } = await admin.from('sfu_room_session_bindings')
    .insert({
      session_id: sessionId,
      room_id: roomId,
      principal_key: principalKey,
    })
  if (error) throw error
  return true
}
