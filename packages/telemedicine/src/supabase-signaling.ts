/**
 * Supabase Realtime signaling for WebRTC P2P calls.
 *
 * Uses two Supabase Realtime primitives:
 *  - **Presence**: peer discovery (replaces server-side room-state tracking)
 *  - **Broadcast**: SDP offer/answer and ICE candidate relay
 *
 * Flow:
 *  1. Both peers subscribe to channel `signaling:{roomId}`
 *  2. On subscribe, each peer tracks presence with { userId, userType }
 *  3. Presence sync delivers room-state (who's already here)
 *  4. Presence join/leave delivers user-joined/user-left events
 *  5. Broadcast relays offer/answer/ice-candidate between peers
 *
 * This eliminates the need for a separate signaling server.
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'

interface SignalingLogger {
  logInfo(msg: string, ctx?: Record<string, unknown>): void
  logWarn(msg: string, ctx?: Record<string, unknown>): void
  logError(msg: string, error: unknown, ctx?: Record<string, unknown>): void
}

export type SignalingMessage = { type: string; from?: string; to?: string; data?: unknown }

type MessageHandler = (message: SignalingMessage) => void
type EventEmitter = (event: string, ...args: unknown[]) => void
type ConnectionStateSetter = (state: string) => void

interface SupabaseSignalingDeps {
  logger: SignalingLogger
  setConnectionState: ConnectionStateSetter
  handleMessage: MessageHandler
  emit: EventEmitter
  cleanup: () => void
}

export interface SupabaseSignalingHandle {
  send: (message: Record<string, unknown>) => void
  close: () => void
  isOpen: () => boolean
}

const SUBSCRIBE_TIMEOUT_MS = 15_000

export function openSupabaseSignaling(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
  userType: string,
  deps: SupabaseSignalingDeps,
  currentHandle: { handle: SupabaseSignalingHandle | null },
): Promise<void> {
  if (currentHandle.handle?.isOpen()) {
    return Promise.resolve()
  }

  const channelName = `signaling:${roomId}`

  const channel: RealtimeChannel = supabase.channel(channelName, {
    config: { broadcast: { self: false }, presence: { key: userId } },
  })

  return new Promise<void>((resolve, reject) => {
    const t0 = performance.now()
    deps.logger.logInfo('Opening Supabase Realtime signaling channel', { channelName, roomId })

    const timeout = setTimeout(() => {
      channel.unsubscribe()
      currentHandle.handle = null
      reject(new Error('Supabase signaling subscribe timeout'))
    }, SUBSCRIBE_TIMEOUT_MS)

    // ── Broadcast: SDP + ICE relay ──
    channel.on('broadcast', { event: 'signaling' }, (payload) => {
      const msg = payload?.payload as SignalingMessage | undefined
      if (!msg || msg.from === userId) return
      if (msg.to && msg.to !== userId) return
      deps.handleMessage(msg)
    })

    // ── Presence: peer discovery ──
    // sync fires once after subscribe with the full presence state
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const users: Array<{ id: string; userType: string }> = []
      for (const [key, presences] of Object.entries(state)) {
        if (key === userId) continue
        const p = presences[0] as { userId?: string; userType?: string } | undefined
        if (p?.userId) {
          users.push({ id: p.userId, userType: p.userType || 'unknown' })
        }
      }
      if (users.length > 0) {
        deps.logger.logInfo('Presence sync: peers already in room', { peerCount: users.length })
        deps.handleMessage({ type: 'room-state', data: { users } })
      }
    })

    // join fires when a NEW peer arrives after we're already subscribed
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (key === userId) return
      const p = newPresences[0] as { userId?: string; userType?: string } | undefined
      if (p?.userId) {
        deps.logger.logInfo('Presence join: peer entered room', { peerId: p.userId })
        deps.handleMessage({
          type: 'user-joined',
          from: p.userId,
          data: { userType: p.userType || 'unknown' },
        })
      }
    })

    // leave fires when a peer disconnects
    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (key === userId) return
      const p = leftPresences[0] as { userId?: string } | undefined
      if (p?.userId) {
        deps.logger.logInfo('Presence leave: peer left room', { peerId: p.userId })
        deps.handleMessage({ type: 'user-left', from: p.userId })
      }
    })

    let subscribed = false

    channel.subscribe(async (status, err) => {
      deps.logger.logInfo('Supabase signaling channel status', { status, channelName, error: err?.message })
      if (status === 'SUBSCRIBED') {
        if (subscribed) return
        subscribed = true
        clearTimeout(timeout)
        const latencyMs = Math.round(performance.now() - t0)
        deps.logger.logInfo('Supabase signaling channel subscribed', { latencyMs, channelName })
        deps.emit('signaling-connected', { latencyMs })

        // Announce our presence so the other peer discovers us
        await channel.track({ userId, userType })

        currentHandle.handle = {
          send: (message: Record<string, unknown>) => {
            // 'join' and 'leave' are handled by presence — skip broadcasting them
            if (message.type === 'join' || message.type === 'leave') return
            channel.send({
              type: 'broadcast',
              event: 'signaling',
              payload: { ...message, from: userId },
            })
          },
          close: () => {
            subscribed = false
            channel.untrack()
            channel.unsubscribe()
            currentHandle.handle = null
            deps.logger.logInfo('Supabase signaling channel closed', { channelName })
            deps.setConnectionState('disconnected')
            deps.cleanup()
          },
          isOpen: () => subscribed,
        }

        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout)
        currentHandle.handle = null
        deps.logger.logError('Supabase signaling channel failed', status, { channelName })
        deps.setConnectionState('failed')
        deps.emit('error', new Error(`Supabase signaling failed: ${status}`))
        reject(new Error(`Supabase signaling failed: ${status}`))
      }
    })
  })
}
