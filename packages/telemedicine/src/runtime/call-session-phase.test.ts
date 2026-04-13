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

  it('returns room-ready when signaling is connected but no peer is established yet', () => {
    expect(
      deriveCallSessionPhase({ connectionState: 'connected', hasPeerConnection: false }),
    ).toBe('room-ready')
  })

  it('returns peer-ready when peer is connected but media is not yet flowing', () => {
    expect(
      deriveCallSessionPhase({ connectionState: 'connected', hasPeerConnection: true }),
    ).toBe('peer-ready')
  })

  it('returns peer-ready when hasRemoteMedia is explicitly false', () => {
    expect(
      deriveCallSessionPhase({ connectionState: 'connected', hasPeerConnection: true, hasRemoteMedia: false }),
    ).toBe('peer-ready')
  })

  it('returns media-live when room is connected, peer is present, and remote media is flowing', () => {
    expect(
      deriveCallSessionPhase({ connectionState: 'connected', hasPeerConnection: true, hasRemoteMedia: true }),
    ).toBe('media-live')
  })

  it('returns media-live even if hasPeerConnection is false but hasRemoteMedia is true (edge case)', () => {
    // In practice hasRemoteMedia implies hasPeerConnection, but the function trusts the flags as given.
    expect(
      deriveCallSessionPhase({ connectionState: 'connected', hasPeerConnection: false, hasRemoteMedia: true }),
    ).toBe('media-live')
  })
})
