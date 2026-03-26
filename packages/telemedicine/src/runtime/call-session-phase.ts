import type { ConnectionState } from '../webrtc-client'

export type CallSessionPhase = 'prejoin' | 'joining' | 'room-ready' | 'peer-ready'

interface DeriveCallSessionPhaseInput {
  connectionState: ConnectionState
  hasPeerConnection: boolean
}

export function deriveCallSessionPhase({
  connectionState,
  hasPeerConnection,
}: DeriveCallSessionPhaseInput): CallSessionPhase {
  if (connectionState === 'connecting') {
    return 'joining'
  }

  if (connectionState === 'connected') {
    return hasPeerConnection ? 'peer-ready' : 'room-ready'
  }

  return 'prejoin'
}
