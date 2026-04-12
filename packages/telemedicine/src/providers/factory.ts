import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import type { CallSessionBootstrap } from '../call-session/types'
import type { CallProvider } from './types'
import { WebRTCClient } from '../webrtc-client'
import { CloudflareCallsClient } from '../cloudflare-calls'

/** @deprecated Use CallProvider instead. Kept for backward compat during migration. */
export type CallClient = WebRTCClient | CloudflareCallsClient

export interface CreateCallProviderOptions {
  bootstrap: CallSessionBootstrap
  /** Supabase client — only needed for P2P signaling via Realtime. */
  supabase?: SupabaseClient
  /** Override ICE servers (e.g. from client-side TURN refresh). */
  iceServersOverride?: RTCIceServer[]
}

export function createCallProvider(opts: CreateCallProviderOptions): CallProvider {
  const { bootstrap, supabase, iceServersOverride } = opts
  const { runtime, user, roomId, transport } = bootstrap
  const iceServers = iceServersOverride ?? transport.iceServers

  logger.info('[createCallProvider]', {
    runtime,
    role: user.role,
    roomId,
    hasTurn: (iceServers?.length ?? 0) > 0,
    hasSfuUrl: Boolean(transport.cloudflareCallsApiUrl),
  })

  switch (runtime) {
    case 'cloudflare-calls':
      return new CloudflareCallsClient({
        userId: user.id,
        userName: user.displayName,
        userType: user.role,
        roomId,
        apiProxyUrl: transport.cloudflareCallsApiUrl ?? '/api/cloudflare-calls',
      })

    case 'webrtc-p2p':
      return new WebRTCClient({
        userId: user.id,
        userName: user.displayName,
        userType: user.role,
        roomId,
        ...(iceServers ? { iceServers } : {}),
        ...(supabase ? { supabase } : {}),
      })

    default:
      throw new Error(`[createCallProvider] Unsupported runtime: "${runtime}". Expected "cloudflare-calls" or "webrtc-p2p".`)
  }
}
