import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import type { CallSessionBootstrap } from '../call-session/types'
import { WebRTCClient } from '../webrtc-client'
import { CloudflareCallsClient } from '../cloudflare-calls'

export type CallClient = WebRTCClient | CloudflareCallsClient

export interface CreateCallProviderOptions {
  bootstrap: CallSessionBootstrap
  /** Supabase client — only needed for P2P signaling via Realtime. */
  supabase?: SupabaseClient
  /** Override ICE servers (e.g. from client-side TURN refresh). */
  iceServersOverride?: RTCIceServer[]
}

export function createCallProvider(opts: CreateCallProviderOptions): CallClient {
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

  if (runtime === 'cloudflare-calls') {
    return new CloudflareCallsClient({
      userId: user.id,
      userName: user.displayName,
      userType: user.role,
      roomId,
      apiProxyUrl: transport.cloudflareCallsApiUrl ?? '/api/cloudflare-calls',
    })
  }

  return new WebRTCClient({
    userId: user.id,
    userName: user.displayName,
    userType: user.role,
    roomId,
    ...(iceServers ? { iceServers } : {}),
    ...(supabase ? { supabase } : {}),
  })
}
