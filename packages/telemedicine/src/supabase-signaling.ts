/**
 * Supabase Realtime signaling for WebRTC P2P calls.
 *
 * Uses two Supabase Realtime primitives:
 *  - **Presence**: peer discovery (replaces server-side room-state tracking)
 *  - **Broadcast**: SDP offer/answer and ICE candidate relay
 *
 * Messages sent before the channel subscribes are buffered and flushed
 * automatically once the subscription completes. This prevents lost
 * ICE candidates and SDP offers during the warmUp race.
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

const SUBSCRIBE_TIMEOUT_MS = 30_000
const MAX_SUBSCRIBE_RETRIES = 1
const RETRY_DELAY_MS = 1_000

export function openSupabaseSignaling(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
  userType: string,
  deps: SupabaseSignalingDeps,
  currentHandle: { handle: SupabaseSignalingHandle | null },
  attempt = 0,
): Promise<void> {
  if (currentHandle.handle?.isOpen()) {
    return Promise.resolve()
  }

  const channelName = `signaling:${roomId}`
  const pendingMessages: Array<Record<string, unknown>> = []
  let subscribed = false

  const channel: RealtimeChannel = supabase.channel(channelName, {
    config: { broadcast: { self: false }, presence: { key: userId } },
  })

  function broadcastMessage(message: Record<string, unknown>): void {
    if (message.type === 'join' || message.type === 'leave') return
    channel.send({
      type: 'broadcast',
      event: 'signaling',
      payload: { ...message, from: userId },
    })
  }

  function flushPending(): void {
    if (pendingMessages.length === 0) return
    deps.logger.logInfo('Flushing buffered signaling messages', { count: pendingMessages.length })
    for (const msg of pendingMessages) {
      broadcastMessage(msg)
    }
    pendingMessages.length = 0
  }

  // Create handle IMMEDIATELY so callers can send() before subscribe completes.
  // Messages are buffered and flushed once the channel is ready.
  currentHandle.handle = {
    send: (message: Record<string, unknown>) => {
      if (message.type === 'join' || message.type === 'leave') return
      if (subscribed) {
        broadcastMessage(message)
      } else {
        pendingMessages.push(message)
        deps.logger.logInfo('Buffered signaling message (channel not ready)', {
          type: typeof message.type === 'string' ? message.type : 'unknown',
          buffered: pendingMessages.length,
        })
      }
    },
    close: () => {
      subscribed = false
      pendingMessages.length = 0
      channel.untrack()
      channel.unsubscribe()
      currentHandle.handle = null
      deps.logger.logInfo('Supabase signaling channel closed', { channelName })
      deps.setConnectionState('disconnected')
      deps.cleanup()
    },
    isOpen: () => true, // Always true — messages buffer if not yet subscribed
  }

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

    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (key === userId) return
      const p = leftPresences[0] as { userId?: string } | undefined
      if (p?.userId) {
        deps.logger.logInfo('Presence leave: peer left room', { peerId: p.userId })
        deps.handleMessage({ type: 'user-left', from: p.userId })
      }
    })

    channel.subscribe(async (status, err) => {
      deps.logger.logInfo('Supabase signaling channel status', { status, channelName, error: err?.message })
      if (status === 'SUBSCRIBED') {
        if (subscribed) return
        subscribed = true
        clearTimeout(timeout)
        const latencyMs = Math.round(performance.now() - t0)
        deps.logger.logInfo('Supabase signaling channel subscribed', { latencyMs, channelName })
        deps.emit('signaling-connected', { latencyMs })

        await channel.track({ userId, userType })
        flushPending()
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout)
        currentHandle.handle = null
        const failure = err ?? new Error(`Supabase signaling failed: ${status}`)

        if (attempt < MAX_SUBSCRIBE_RETRIES) {
          deps.logger.logWarn('Supabase signaling channel failed, retrying subscribe', {
            channelName,
            status,
            attempt: attempt + 1,
            maxAttempts: MAX_SUBSCRIBE_RETRIES + 1,
          })
          channel.unsubscribe()
          setTimeout(() => {
            void openSupabaseSignaling(
              supabase,
              roomId,
              userId,
              userType,
              deps,
              currentHandle,
              attempt + 1,
            ).then(resolve, reject)
          }, RETRY_DELAY_MS)
          return
        }

        deps.logger.logError(
          'Supabase signaling channel failed',
          failure,
          { channelName, status },
        )
        deps.setConnectionState('failed')
        deps.emit('error', new Error(`Supabase signaling failed: ${status}`))
        reject(new Error(`Supabase signaling failed: ${status}`))
      }
    })
  })
}
