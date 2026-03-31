import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BitrateAdapter, INITIAL_VIDEO_BITRATE } from './bitrate-adapter'
import type { BitrateAdapterCallbacks } from './bitrate-adapter'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./debug', () => ({
  createTelemedicineLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('./media-manager', () => ({}))
vi.mock('./quality-monitor', () => ({}))

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
}

function createMockCallbacks(): BitrateAdapterCallbacks {
  return { emit: vi.fn() }
}

function createMockPeerMap(maxBitrate: number) {
  const setParameters = vi.fn(async () => {})
  const mockSender = {
    track: { kind: 'video' },
    getParameters: () => ({
      encodings: [{ maxBitrate, maxFramerate: 30 }],
    }),
    setParameters,
  }
  const pc = { getSenders: () => [mockSender] } as any
  const map = new Map([['peer-1', { pc, iceRestartCount: 0 }]])
  return { map, setParameters, mockSender }
}

// ── adaptToBandwidthEstimate ────────────────────────────────────────────────

describe('BitrateAdapter — adaptToBandwidthEstimate', () => {
  let adapter: BitrateAdapter

  beforeEach(() => {
    vi.useFakeTimers()
    adapter = new BitrateAdapter(createMockLogger(), 'session-1', createMockCallbacks())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should cap bitrate at 85% of available bandwidth', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    // Available = 1000 kbps → target = 1000 * 1000 * 0.85 = 850_000
    adapter.adaptToBandwidthEstimate(map, 1000)

    expect(setParameters).toHaveBeenCalledOnce()
    const params = setParameters.mock.calls[0][0]
    expect(params.encodings[0].maxBitrate).toBe(850_000)
  })

  it('should NOT reduce below INITIAL_VIDEO_BITRATE (500_000)', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    // Available = 100 kbps → 85% = 85_000, but floor is 500_000
    // Since floor (500_000) < current (2_000_000), it reduces to floor
    adapter.adaptToBandwidthEstimate(map, 100)

    expect(setParameters).toHaveBeenCalledOnce()
    const params = setParameters.mock.calls[0][0]
    expect(params.encodings[0].maxBitrate).toBe(INITIAL_VIDEO_BITRATE)
  })

  it('should NOT increase beyond current maxBitrate (only reduces)', () => {
    const { map, setParameters } = createMockPeerMap(800_000)

    // Available = 5000 kbps → 85% = 4_250_000, but current is only 800_000
    // Since cappedBps > current, no change should happen
    adapter.adaptToBandwidthEstimate(map, 5000)

    expect(setParameters).not.toHaveBeenCalled()
  })

  it('should respect 3-second cooldown (ignore calls within 3s)', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    adapter.adaptToBandwidthEstimate(map, 1000)
    expect(setParameters).toHaveBeenCalledOnce()

    // Call again immediately — should be ignored
    vi.advanceTimersByTime(1000)
    adapter.adaptToBandwidthEstimate(map, 800)
    expect(setParameters).toHaveBeenCalledOnce()

    // After cooldown — should work
    vi.advanceTimersByTime(3001)
    const { map: map2, setParameters: setParams2 } = createMockPeerMap(2_000_000)
    adapter.adaptToBandwidthEstimate(map2, 800)
    expect(setParams2).toHaveBeenCalledOnce()
  })

  it('should log the adaptation', () => {
    const logger = createMockLogger()
    adapter = new BitrateAdapter(logger, 'session-1', createMockCallbacks())
    const { map } = createMockPeerMap(2_000_000)

    adapter.adaptToBandwidthEstimate(map, 1000)

    expect(logger.info).toHaveBeenCalledWith(
      'BWE adaptation: capped bitrate to available bandwidth',
      expect.objectContaining({
        peerId: 'peer-1',
        availableKbps: 1000,
        fromKbps: 2000,
        toKbps: 850,
      }),
    )
  })
})

// ── handleQualityDegradation ────────────────────────────────────────────────

describe('BitrateAdapter — handleQualityDegradation', () => {
  let adapter: BitrateAdapter

  beforeEach(() => {
    vi.useFakeTimers()
    adapter = new BitrateAdapter(createMockLogger(), 'session-1', createMockCallbacks())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should reduce to 70% when level is fair and packet loss is 3-6%', () => {
    const { map, setParameters } = createMockPeerMap(1_000_000)

    adapter.handleQualityDegradation(map, 'fair', {
      packetsLostPct: 4,
      roundTripTimeMs: null,
    })

    expect(setParameters).toHaveBeenCalledOnce()
    const params = setParameters.mock.calls[0][0]
    expect(params.encodings[0].maxBitrate).toBe(700_000)
  })

  it('should reduce to 70% when level is fair and RTT is 220-350ms', () => {
    const { map, setParameters } = createMockPeerMap(1_000_000)

    adapter.handleQualityDegradation(map, 'fair', {
      packetsLostPct: null,
      roundTripTimeMs: 280,
    })

    expect(setParameters).toHaveBeenCalledOnce()
    const params = setParameters.mock.calls[0][0]
    expect(params.encodings[0].maxBitrate).toBe(700_000)
  })

  it('should reduce to 40% when level is poor', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    adapter.handleQualityDegradation(map, 'poor', {
      packetsLostPct: 12,
      roundTripTimeMs: 500,
    })

    expect(setParameters).toHaveBeenCalledOnce()
    const params = setParameters.mock.calls[0][0]
    expect(params.encodings[0].maxBitrate).toBe(800_000)
  })

  it('should set maxFramerate to 15 when level is poor', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    adapter.handleQualityDegradation(map, 'poor', {
      packetsLostPct: 12,
      roundTripTimeMs: 500,
    })

    const params = setParameters.mock.calls[0][0]
    expect(params.encodings[0].maxFramerate).toBe(15)
  })

  it('should NOT act when level is excellent', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    adapter.handleQualityDegradation(map, 'excellent', {
      packetsLostPct: 0,
      roundTripTimeMs: 50,
    })

    expect(setParameters).not.toHaveBeenCalled()
  })

  it('should NOT act when level is good', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    adapter.handleQualityDegradation(map, 'good', {
      packetsLostPct: 1,
      roundTripTimeMs: 150,
    })

    expect(setParameters).not.toHaveBeenCalled()
  })

  it('should NOT act when level is unknown', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    adapter.handleQualityDegradation(map, 'unknown', {
      packetsLostPct: null,
      roundTripTimeMs: null,
    })

    expect(setParameters).not.toHaveBeenCalled()
  })

  it('should NOT reduce below INITIAL_VIDEO_BITRATE', () => {
    // Current is at the floor already — 40% of 500k = 200k, but clamped to 500k
    const { map, setParameters } = createMockPeerMap(INITIAL_VIDEO_BITRATE)

    adapter.handleQualityDegradation(map, 'poor', {
      packetsLostPct: 15,
      roundTripTimeMs: 600,
    })

    // reduced = max(500_000 * 0.4, 500_000) = 500_000, not < current → no call
    expect(setParameters).not.toHaveBeenCalled()
  })

  it('should respect 3-second cooldown', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    adapter.handleQualityDegradation(map, 'poor', {
      packetsLostPct: 12,
      roundTripTimeMs: 500,
    })
    expect(setParameters).toHaveBeenCalledOnce()

    // Immediate second call — should be ignored
    vi.advanceTimersByTime(1000)
    adapter.handleQualityDegradation(map, 'poor', {
      packetsLostPct: 15,
      roundTripTimeMs: 600,
    })
    expect(setParameters).toHaveBeenCalledOnce()

    // After cooldown — should work
    vi.advanceTimersByTime(3001)
    const { map: map2, setParameters: setParams2 } = createMockPeerMap(2_000_000)
    adapter.handleQualityDegradation(map2, 'poor', {
      packetsLostPct: 15,
      roundTripTimeMs: 600,
    })
    expect(setParams2).toHaveBeenCalledOnce()
  })

  it('should NOT act for fair level without warning thresholds', () => {
    const { map, setParameters } = createMockPeerMap(2_000_000)

    // Fair with loss < 3 and RTT < 220 — no action
    adapter.handleQualityDegradation(map, 'fair', {
      packetsLostPct: 1,
      roundTripTimeMs: 100,
    })

    expect(setParameters).not.toHaveBeenCalled()
  })
})
