import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCallProvider } from './factory'
import { WebRTCClient } from '../webrtc-client'
import { CloudflareCallsClient } from '../cloudflare-calls'
import type { CallSessionBootstrap } from '../call-session/types'

vi.mock('@autamedica/shared', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../config/ice-servers', () => ({
  loadSignalingUrl: () => 'wss://test-signaling.example.com',
  loadIceServers: () => [],
  ICE_STUN_ONLY: [{ urls: 'stun:stun.l.google.com:19302' }],
  hasTurnIceServer: () => false,
  hasStunIceServer: () => true,
  fetchTurnCredentials: vi.fn(),
  getIceServersConfig: () => [{ urls: 'stun:stun.l.google.com:19302' }],
  validateIceServersConfig: () => true,
}))

function makeBootstrap(overrides?: Partial<CallSessionBootstrap>): CallSessionBootstrap {
  return {
    callId: 'call-1',
    roomId: 'room-abc',
    appointmentId: null,
    runtime: 'cloudflare-calls',
    user: { id: 'user-1', role: 'doctor', displayName: 'Dr Test' },
    permissions: { canJoin: true, canPublishAudio: true, canPublishVideo: true, canUseChat: true, canRecord: true },
    mediaPolicy: { requireCamera: false, requireMicrophone: true, allowAudioOnlyFallback: true },
    transport: { iceServers: [], cloudflareCallsApiUrl: '/api/doctors/cloudflare-calls' },
    waitingRoom: { enabled: false },
    ...overrides,
  }
}

describe('createCallProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns CloudflareCallsClient when runtime is cloudflare-calls', () => {
    const provider = createCallProvider({ bootstrap: makeBootstrap() })
    expect(provider).toBeInstanceOf(CloudflareCallsClient)
  })

  it('returns WebRTCClient when runtime is webrtc-p2p', () => {
    const provider = createCallProvider({
      bootstrap: makeBootstrap({
        runtime: 'webrtc-p2p',
        transport: { iceServers: [], cloudflareCallsApiUrl: null },
      }),
    })
    expect(provider).toBeInstanceOf(WebRTCClient)
  })

  it('throws when transport.cloudflareCallsApiUrl is missing for cloudflare-calls', () => {
    expect(() =>
      createCallProvider({
        bootstrap: makeBootstrap({
          runtime: 'cloudflare-calls',
          transport: { cloudflareCallsApiUrl: null },
        }),
      })
    ).toThrow('Missing cloudflareCallsApiUrl')
  })

  it('passes iceServersOverride to WebRTCClient when provided', () => {
    const customIce: RTCIceServer[] = [{ urls: 'turn:custom.example.com' }]
    const provider = createCallProvider({
      bootstrap: makeBootstrap({
        runtime: 'webrtc-p2p',
        transport: { iceServers: [{ urls: 'stun:default.example.com' }], cloudflareCallsApiUrl: null },
      }),
      iceServersOverride: customIce,
    })
    expect(provider).toBeInstanceOf(WebRTCClient)
  })

  it('passes transport.signalingUrl to WebRTCClient when provided', () => {
    const provider = createCallProvider({
      bootstrap: makeBootstrap({
        runtime: 'webrtc-p2p',
        transport: {
          iceServers: [],
          cloudflareCallsApiUrl: null,
          signalingUrl: 'wss://custom-signaling.example.com',
        },
      }),
    }) as WebRTCClient & { config?: { signalingUrl?: string } }

    expect(provider).toBeInstanceOf(WebRTCClient)
    expect(provider['config']?.signalingUrl).toBe('wss://custom-signaling.example.com')
  })

  it('satisfies CallProvider interface for both runtime paths', () => {
    const sfuProvider = createCallProvider({ bootstrap: makeBootstrap() })
    const p2pProvider = createCallProvider({
      bootstrap: makeBootstrap({
        runtime: 'webrtc-p2p',
        transport: { iceServers: [], cloudflareCallsApiUrl: null },
      }),
    })

    for (const provider of [sfuProvider, p2pProvider]) {
      expect(typeof provider.warmUp).toBe('function')
      expect(typeof provider.connect).toBe('function')
      expect(typeof provider.disconnect).toBe('function')
      expect(typeof provider.getLocalStream).toBe('function')
      expect(typeof provider.toggleAudio).toBe('function')
      expect(typeof provider.toggleVideo).toBe('function')
      expect(typeof provider.switchDevice).toBe('function')
      expect(typeof provider.sendChatMessage).toBe('function')
      expect(typeof provider.on).toBe('function')
    }
  })

  it('throws for unsupported runtime', () => {
    expect(() =>
      createCallProvider({
        bootstrap: makeBootstrap({ runtime: 'livekit' }),
      })
    ).toThrow('Unsupported runtime: "livekit"')
  })

  it('logs provider creation with runtime and transport info', async () => {
    const { logger } = await import('@autamedica/shared')
    createCallProvider({ bootstrap: makeBootstrap() })
    expect(logger.info).toHaveBeenCalledWith('[createCallProvider]', expect.objectContaining({
      runtime: 'cloudflare-calls',
      role: 'doctor',
      roomId: 'room-abc',
    }))
  })
})
