import type { ConnectionState } from '../providers/types'

export type CallSessionPhase = 'prejoin' | 'joining' | 'room-ready' | 'peer-ready' | 'media-live'

interface DeriveCallSessionPhaseInput {
  connectionState: ConnectionState
  hasPeerConnection: boolean
  hasRemoteMedia?: boolean
}

export function deriveCallSessionPhase({
  connectionState,
  hasPeerConnection,
  hasRemoteMedia = false,
}: DeriveCallSessionPhaseInput): CallSessionPhase {
  if (connectionState === 'connecting') {
    return 'joining'
  }

  if (connectionState === 'connected') {
    if (hasRemoteMedia) return 'media-live'
    if (hasPeerConnection) return 'peer-ready'
    return 'room-ready'
  }

  return 'prejoin'
}
