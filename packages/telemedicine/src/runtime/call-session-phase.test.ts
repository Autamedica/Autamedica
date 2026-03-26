import { describe, expect, it } from 'vitest'
import { deriveCallSessionPhase } from './call-session-phase'

describe('deriveCallSessionPhase', () => {
  it('returns prejoin when not connected to the room yet', () => {
    expect(
      deriveCallSessionPhase({ connectionState: 'disconnected', hasPeerConnection: false }),
    ).toBe('prejoin')
  })

  it('returns joining while room connection is in progress', () => {
    expect(
      deriveCallSessionPhase({ connectionState: 'connecting', hasPeerConnection: false }),
    ).toBe('joining')
  })

  it('returns room-ready when signaling or room is connected but no peer is established yet', () => {
    expect(
      deriveCallSessionPhase({ connectionState: 'connected', hasPeerConnection: false }),
    ).toBe('room-ready')
  })

  it('returns peer-ready only when room is connected and there is a peer connection', () => {
    expect(
      deriveCallSessionPhase({ connectionState: 'connected', hasPeerConnection: true }),
    ).toBe('peer-ready')
  })
})
