import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QualityMonitor } from './quality-monitor'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./debug', () => ({
  createTelemedicineLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('./media-manager', () => ({}))

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
}

/**
 * Build a stats map that simulates RTCPeerConnection.getStats().
 * Supports two collection passes — first sets baseline, second computes deltas.
 */
function createStatsMap(overrides: {
  rtt?: number
  loss?: number
  received?: number
  jitter?: number
  fps?: number
  inboundVideoBytes?: number
  outboundVideoBytes?: number
}): Map<string, any> {
  const map = new Map<string, any>()

  map.set('outbound-rtp-video', {
    type: 'outbound-rtp',
    kind: 'video',
    bytesSent: overrides.outboundVideoBytes ?? 0,
  })

  map.set('outbound-rtp-audio', {
    type: 'outbound-rtp',
    kind: 'audio',
    bytesSent: 0,
  })

  map.set('inbound-rtp-video', {
    type: 'inbound-rtp',
    kind: 'video',
    bytesReceived: overrides.inboundVideoBytes ?? 0,
    packetsLost: overrides.loss ?? 0,
    packetsReceived: overrides.received ?? 1000,
    jitter: overrides.jitter !== undefined ? overrides.jitter / 1000 : 0.01,
  })

  map.set('inbound-rtp-audio', {
    type: 'inbound-rtp',
    kind: 'audio',
    bytesReceived: 0,
    packetsLost: 0,
    packetsReceived: 0,
  })

  map.set('candidate-pair-1', {
    type: 'candidate-pair',
    selected: true,
    nominated: true,
    state: 'succeeded',
    currentRoundTripTime: overrides.rtt !== undefined ? overrides.rtt / 1000 : 0.05,
    availableOutgoingBitrate: 2_500_000,
  })

  map.set('track-video', {
    type: 'track',
    kind: 'video',
    framesPerSecond: overrides.fps ?? 30,
    frameWidth: 1280,
    frameHeight: 720,
  })

  return map
}

function createMockPC(stats: Map<string, any>) {
  return {
    connectionState: 'connected',
    getStats: vi.fn(async () => stats),
  } as any
}

// ── getCallSummary ──────────────────────────────────────────────────────────

describe('QualityMonitor — getCallSummary', () => {
  let monitor: QualityMonitor

  beforeEach(() => {
    vi.useFakeTimers()
    monitor = new QualityMonitor({
      logger: createMockLogger(),
      roomId: 'room-1',
    })
  })

  afterEach(() => {
    monitor.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should return zero duration when monitoring has not started', () => {
    const summary = monitor.getCallSummary()

    expect(summary.totalDurationMs).toBe(0)
    expect(summary.timeline).toEqual([])
    expect(summary.qualityBreakdown).toEqual({
      unknown: 0,
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
    })
  })

  it('should return correct totalDurationMs after start()', async () => {
    const stats = createStatsMap({})
    const pc = createMockPC(stats)
    const peers = new Map([['user-1', { pc }]])

    monitor.start(peers)

    // Advance 10 seconds
    vi.advanceTimersByTime(10_000)

    const summary = monitor.getCallSummary()
    expect(summary.totalDurationMs).toBe(10_000)
  })

  it('should track quality level transitions in timeline', async () => {
    // Pass 1 — excellent quality (baseline)
    const statsExcellent = createStatsMap({ rtt: 50, loss: 0, received: 1000, jitter: 10, fps: 30, inboundVideoBytes: 0 })
    const pc = createMockPC(statsExcellent)
    const peers = new Map([['user-1', { pc }]])

    monitor.start(peers)
    // Wait for first collect to finish
    await vi.advanceTimersByTimeAsync(100)

    // Pass 2 — still excellent (with delta bytes for bitrate calc)
    const statsExcellent2 = createStatsMap({ rtt: 50, loss: 0, received: 2000, jitter: 10, fps: 30, inboundVideoBytes: 1_250_000 })
    pc.getStats.mockResolvedValue(statsExcellent2)

    // Advance to next collection cycle (5s)
    await vi.advanceTimersByTimeAsync(5_000)

    // Pass 3 — degrade to poor
    const statsPoor = createStatsMap({ rtt: 500, loss: 200, received: 2200, jitter: 80, fps: 5, inboundVideoBytes: 1_300_000 })
    pc.getStats.mockResolvedValue(statsPoor)

    await vi.advanceTimersByTimeAsync(5_000)

    // Advance a bit more so the final level has duration
    vi.advanceTimersByTime(2_000)

    const summary = monitor.getCallSummary()

    // Timeline should contain at least one transition
    expect(summary.timeline.length).toBeGreaterThanOrEqual(1)

    // There should be entries — the exact levels depend on scoring, but we verify structure
    for (const entry of summary.timeline) {
      expect(entry).toHaveProperty('timestamp')
      expect(entry).toHaveProperty('level')
      expect(entry).toHaveProperty('durationMs')
      expect(entry.durationMs).toBeGreaterThanOrEqual(0)
    }

    // At least the final entry (appended by getCallSummary) should have positive duration
    const lastEntry = summary.timeline[summary.timeline.length - 1]
    expect(lastEntry.durationMs).toBeGreaterThan(0)
  })

  it('should compute qualityBreakdown as percentages', async () => {
    const stats = createStatsMap({ rtt: 50, loss: 0, received: 1000, jitter: 10, fps: 30, inboundVideoBytes: 0 })
    const pc = createMockPC(stats)
    const peers = new Map([['user-1', { pc }]])

    monitor.start(peers)
    await vi.advanceTimersByTimeAsync(100)

    // Second pass with bitrate data
    const stats2 = createStatsMap({ rtt: 50, loss: 0, received: 2000, jitter: 10, fps: 30, inboundVideoBytes: 2_000_000 })
    pc.getStats.mockResolvedValue(stats2)
    await vi.advanceTimersByTimeAsync(5_000)

    vi.advanceTimersByTime(5_000)

    const summary = monitor.getCallSummary()

    // Breakdown percentages should sum to ~100
    const totalPct = Object.values(summary.qualityBreakdown).reduce((a, b) => a + b, 0)
    expect(totalPct).toBeCloseTo(100, 0)
  })

  it('should track worst metrics', async () => {
    // Pass 1 — baseline
    const stats1 = createStatsMap({ rtt: 100, loss: 10, received: 1000, jitter: 20, fps: 25, inboundVideoBytes: 0 })
    const pc = createMockPC(stats1)
    const peers = new Map([['user-1', { pc }]])

    monitor.start(peers)
    await vi.advanceTimersByTimeAsync(100)

    // Pass 2 — worse metrics
    const stats2 = createStatsMap({ rtt: 400, loss: 50, received: 1200, jitter: 80, fps: 8, inboundVideoBytes: 500_000 })
    pc.getStats.mockResolvedValue(stats2)
    await vi.advanceTimersByTimeAsync(5_000)

    // Pass 3 — even worse RTT
    const stats3 = createStatsMap({ rtt: 600, loss: 60, received: 1300, jitter: 90, fps: 5, inboundVideoBytes: 600_000 })
    pc.getStats.mockResolvedValue(stats3)
    await vi.advanceTimersByTimeAsync(5_000)

    const summary = monitor.getCallSummary()

    // Worst RTT should be the highest seen
    expect(summary.worstMetrics.roundTripTimeMs).toBeGreaterThanOrEqual(600)

    // Worst fps should be the lowest seen
    if (summary.worstMetrics.framesPerSecond !== null) {
      expect(summary.worstMetrics.framesPerSecond).toBeLessThanOrEqual(8)
    }
  })

  it('should compute average metrics', async () => {
    const stats1 = createStatsMap({ rtt: 100, loss: 0, received: 1000, jitter: 20, fps: 30, inboundVideoBytes: 0 })
    const pc = createMockPC(stats1)
    const peers = new Map([['user-1', { pc }]])

    monitor.start(peers)
    await vi.advanceTimersByTimeAsync(100)

    const stats2 = createStatsMap({ rtt: 200, loss: 10, received: 2000, jitter: 40, fps: 20, inboundVideoBytes: 1_000_000 })
    pc.getStats.mockResolvedValue(stats2)
    await vi.advanceTimersByTimeAsync(5_000)

    const stats3 = createStatsMap({ rtt: 300, loss: 20, received: 3000, jitter: 60, fps: 15, inboundVideoBytes: 1_500_000 })
    pc.getStats.mockResolvedValue(stats3)
    await vi.advanceTimersByTimeAsync(5_000)

    const summary = monitor.getCallSummary()

    // Averages should be non-null after multiple samples
    expect(summary.averageMetrics.roundTripTimeMs).not.toBeNull()
    expect(summary.averageMetrics.jitterMs).not.toBeNull()
  })

  it('should include iceRestartCount from parameter', () => {
    const summary = monitor.getCallSummary(3)
    expect(summary.iceRestartCount).toBe(3)
  })

  it('should include audioOnlyPeriods', () => {
    monitor.recordAudioOnlyFallback()
    monitor.recordAudioOnlyFallback()

    const summary = monitor.getCallSummary()
    expect(summary.audioOnlyPeriods).toBe(2)
  })
})

// ── recordAudioOnlyFallback ─────────────────────────────────────────────────

describe('QualityMonitor — recordAudioOnlyFallback', () => {
  it('should increment audioOnlyPeriods counter', () => {
    const monitor = new QualityMonitor({
      logger: createMockLogger(),
      roomId: 'room-1',
    })

    expect(monitor.getCallSummary().audioOnlyPeriods).toBe(0)

    monitor.recordAudioOnlyFallback()
    expect(monitor.getCallSummary().audioOnlyPeriods).toBe(1)

    monitor.recordAudioOnlyFallback()
    monitor.recordAudioOnlyFallback()
    expect(monitor.getCallSummary().audioOnlyPeriods).toBe(3)
  })
})

// ── clearState ──────────────────────────────────────────────────────────────

describe('QualityMonitor — clearState', () => {
  let monitor: QualityMonitor

  beforeEach(() => {
    vi.useFakeTimers()
    monitor = new QualityMonitor({
      logger: createMockLogger(),
      roomId: 'room-1',
    })
  })

  afterEach(() => {
    monitor.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should reset all summary state', async () => {
    const stats = createStatsMap({ rtt: 100, loss: 5, received: 1000, jitter: 30, fps: 25, inboundVideoBytes: 0 })
    const pc = createMockPC(stats)
    const peers = new Map([['user-1', { pc }]])

    monitor.start(peers)
    await vi.advanceTimersByTimeAsync(100)

    const stats2 = createStatsMap({ rtt: 200, loss: 10, received: 2000, jitter: 50, fps: 15, inboundVideoBytes: 500_000 })
    pc.getStats.mockResolvedValue(stats2)
    await vi.advanceTimersByTimeAsync(5_000)

    monitor.recordAudioOnlyFallback()
    monitor.recordAudioOnlyFallback()

    // Verify state is populated
    const before = monitor.getCallSummary(2)
    expect(before.totalDurationMs).toBeGreaterThan(0)
    expect(before.audioOnlyPeriods).toBe(2)

    // Clear and verify reset
    monitor.stop()
    monitor.clearState()

    const after = monitor.getCallSummary()
    expect(after.totalDurationMs).toBe(0)
    expect(after.timeline).toEqual([])
    expect(after.audioOnlyPeriods).toBe(0)
    expect(after.worstMetrics.packetsLostPct).toBeNull()
    expect(after.worstMetrics.jitterMs).toBeNull()
    expect(after.worstMetrics.roundTripTimeMs).toBeNull()
    expect(after.worstMetrics.inboundVideoBitrateKbps).toBeNull()
    expect(after.worstMetrics.framesPerSecond).toBeNull()
    expect(after.averageMetrics.packetsLostPct).toBeNull()
    expect(after.averageMetrics.jitterMs).toBeNull()
    expect(after.averageMetrics.roundTripTimeMs).toBeNull()
    expect(after.averageMetrics.inboundVideoBitrateKbps).toBeNull()
  })
})
