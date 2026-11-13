import { afterEach, describe, expect, it, vi } from 'vitest'
import { SfuQualityMonitor } from './quality'
import type { StreamQualityMetrics } from '../quality-monitor'

vi.mock('../debug', () => ({
  createTelemedicineLogger: () => ({ info: vi.fn(), warn: vi.fn() }),
}))

function audioStats(received = 90, lost = 10): RTCStatsReport {
  return new Map([
    [
      'audio',
      {
        id: 'audio',
        timestamp: 0,
        type: 'inbound-rtp',
        kind: 'audio',
        bytesReceived: received * 100,
        packetsReceived: received,
        packetsLost: lost,
        jitter: 0.08,
      },
    ],
  ]) as unknown as RTCStatsReport
}

afterEach(() => vi.useRealTimers())

describe('SFU quality integration', () => {
  it('reports audio-only loss and jitter and emits one closing summary', async () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const getStats = vi.fn().mockResolvedValue(audioStats())
    const monitor = new SfuQualityMonitor(
      'room',
      { connectionState: 'connected', getStats },
      emit
    )
    await vi.advanceTimersByTimeAsync(1)
    const metrics = emit.mock.calls.find(
      ([event]) => event === 'quality-report'
    )?.[1] as StreamQualityMetrics
    expect(metrics).toMatchObject({
      userId: 'sfu',
      level: 'poor',
      packetsLostPct: 10,
      jitterMs: 80,
    })
    getStats.mockResolvedValue(audioStats(180, 20))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(
      emit.mock.calls
        .filter(([event]) => event === 'quality-report')
        .at(-1)?.[1]
    ).toMatchObject({
      inboundAudioBitrateKbps: expect.any(Number),
      packetsLostPct: 10,
    })
    monitor.stop()
    monitor.stop()
    expect(
      emit.mock.calls.filter(([event]) => event === 'call-quality-summary')
    ).toHaveLength(1)
    const calls = getStats.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(getStats).toHaveBeenCalledTimes(calls)
  })

  it('does not emit a late sample after disconnect while getStats is pending', async () => {
    vi.useFakeTimers()
    let resolveStats!: (value: RTCStatsReport) => void
    const getStats = vi.fn(
      () =>
        new Promise<RTCStatsReport>((resolve) => {
          resolveStats = resolve
        })
    )
    const emit = vi.fn()
    const monitor = new SfuQualityMonitor(
      'room',
      { connectionState: 'connected', getStats },
      emit
    )
    monitor.stop()
    resolveStats(audioStats())
    await vi.advanceTimersByTimeAsync(1)
    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      'call-quality-summary',
    ])
  })

  it('retains unknown when the browser supplies no measurements', async () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const monitor = new SfuQualityMonitor(
      'room',
      {
        connectionState: 'connected',
        getStats: async () => new Map() as RTCStatsReport,
      },
      emit
    )
    await vi.advanceTimersByTimeAsync(1)
    expect(
      emit.mock.calls.find(([event]) => event === 'stream-quality')?.[1]
    ).toMatchObject({ overallLevel: 'unknown' })
    monitor.stop()
  })
})
