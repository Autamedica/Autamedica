import { describe, it, expect, vi, afterEach } from 'vitest'
import { NetworkPreflight } from './preflight'

function createMockCandidate(type: 'srflx' | 'relay' | 'host'): RTCIceCandidate {
  return { candidate: `candidate:1 1 udp 2130706431 192.168.1.1 54321 typ ${type}` } as unknown as RTCIceCandidate
}

/** Captures the instance created by `new RTCPeerConnection(...)` so we can assert on it */
function stubRTCPeerConnection(opts: {
  candidates?: Array<'srflx' | 'relay' | 'host'>
  availableBw?: number
  failOffer?: boolean
}) {
  let instance: Record<string, unknown> | null = null

  function MockRTCPeerConnection(this: Record<string, unknown>) {
    instance = this
    this.onicecandidate = null
    this.onicegatheringstatechange = null
    this.iceGatheringState = 'new'
    this.addTransceiver = vi.fn()
    this.createOffer = opts.failOffer
      ? vi.fn().mockRejectedValue(new Error('offer failed'))
      : vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' })
    this.setLocalDescription = vi.fn().mockImplementation(() => {
      if (!instance) throw new Error('expected instance')
      const self = instance
      setTimeout(() => {
        const handler = self.onicecandidate as ((e: { candidate: RTCIceCandidate | null }) => void) | null
        if (!handler) return
        for (const type of (opts.candidates ?? [])) {
          handler({ candidate: createMockCandidate(type) })
        }
        handler({ candidate: null })
      }, 5)
      return Promise.resolve()
    })
    this.createDataChannel = vi.fn().mockReturnValue({
      onopen: null,
      onerror: null,
      close: vi.fn(),
      bufferedAmount: 0,
      send: vi.fn(),
    })
    this.getStats = vi.fn().mockResolvedValue(
      opts.availableBw != null
        ? new Map([['cp1', { type: 'candidate-pair', availableOutgoingBitrate: opts.availableBw }]])
        : new Map()
    )
    this.close = vi.fn()
  }

  vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)
  return () => instance
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NetworkPreflight', () => {
  it('returns "hd" when STUN + TURN reachable and high bandwidth', async () => {
    const getInstance = stubRTCPeerConnection({ candidates: ['srflx', 'relay'], availableBw: 2_000_000 })

    const preflight = new NetworkPreflight()
    const result = await preflight.run([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' },
    ])

    expect(result.stunReachable).toBe(true)
    expect(result.turnReachable).toBe(true)
    expect(result.recommendation).toBe('hd')
    expect(getInstance()?.close).toHaveBeenCalled()
  })

  it('returns "sd" when only STUN reachable and moderate bandwidth', async () => {
    stubRTCPeerConnection({ candidates: ['srflx'], availableBw: 700_000 })

    const preflight = new NetworkPreflight()
    const result = await preflight.run([
      { urls: 'stun:stun.l.google.com:19302' },
    ])

    expect(result.stunReachable).toBe(true)
    expect(result.turnReachable).toBe(false)
    expect(result.recommendation).toBe('sd')
  })

  it('returns "audio-only" when low bandwidth', async () => {
    stubRTCPeerConnection({ candidates: ['srflx', 'relay'], availableBw: 150_000 })

    const preflight = new NetworkPreflight()
    const result = await preflight.run([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' },
    ])

    expect(result.stunReachable).toBe(true)
    expect(result.recommendation).toBe('audio-only')
  })

  it('returns "unreachable" when no ICE candidates gathered', async () => {
    stubRTCPeerConnection({ candidates: [] })

    const preflight = new NetworkPreflight()
    const result = await preflight.run([
      { urls: 'stun:stun.l.google.com:19302' },
    ])

    expect(result.stunReachable).toBe(false)
    expect(result.turnReachable).toBe(false)
    expect(result.recommendation).toBe('unreachable')
  })

  it('returns "unreachable" when no ICE servers provided', async () => {
    const preflight = new NetworkPreflight()
    const result = await preflight.run([])

    expect(result.recommendation).toBe('unreachable')
    expect(result.details).toContain('Sin servidores ICE')
  })

  it('returns "unreachable" when offer creation fails', async () => {
    const getInstance = stubRTCPeerConnection({ failOffer: true })

    const preflight = new NetworkPreflight()
    const result = await preflight.run([{ urls: 'stun:stun.l.google.com:19302' }])

    expect(result.recommendation).toBe('unreachable')
    expect(getInstance()?.close).toHaveBeenCalled()
  })

  it('returns conservative bandwidth when stats report nothing', async () => {
    const _getInstance = stubRTCPeerConnection({ candidates: ['srflx'] })
    // Override getStats after construction happens inside run()
    // We need to patch after construction, so let's use a custom approach
    const _origStub = vi.fn()
    const origGlobal = globalThis.RTCPeerConnection

    // Re-stub to override getStats
    function MockPC(this: Record<string, unknown>) {
      origGlobal.call(this)
      // Override getStats to return empty
      this.getStats = vi.fn().mockResolvedValue(new Map())
    }
    MockPC.prototype = origGlobal.prototype
    vi.stubGlobal('RTCPeerConnection', MockPC)

    const preflight = new NetworkPreflight()
    const result = await preflight.run([{ urls: 'stun:stun.l.google.com:19302' }])

    expect(result.stunReachable).toBe(true)
    // Conservative default 800kbps => sd
    expect(result.estimatedBandwidthKbps).toBe(800)
    expect(result.recommendation).toBe('sd')
  })
})
