import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachQualityTelemetry } from './telemetry'
import type { CallProvider, WebRTCEvents } from '../providers/types'
import type { StreamQualityMetrics } from '../quality-monitor'

afterEach(() => vi.useRealTimers())

describe('quality telemetry persistence', () => {
  it('bounds writes, excludes raw data and removes listeners on cleanup', async () => {
    vi.useFakeTimers()
    const handlers = new Map<keyof WebRTCEvents, (value: unknown) => void>()
    const client = {
      on: (event: keyof WebRTCEvents, handler: (value: unknown) => void) => {
        handlers.set(event, handler)
        return () => {
          handlers.delete(event)
        }
      },
    } as unknown as CallProvider
    const write = vi.fn().mockResolvedValue(undefined)
    const detach = attachQualityTelemetry(client, write, 'client_to_sfu')
    const report = {
      userId: 'sfu',
      timestamp: Date.now(),
      level: 'poor',
      jitterMs: 90,
      rawSdp: 'private',
      candidateAddress: 'private',
    } as unknown as StreamQualityMetrics
    handlers.get('quality-report')?.(report)
    for (let i = 0; i < 10; i++) handlers.get('quality-report')?.(report)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]).toEqual([
      'quality_report',
      expect.objectContaining({ scope: 'client_to_sfu', jitterMs: 90 }),
    ])
    expect(JSON.stringify(write.mock.calls)).not.toContain('private')
    await vi.advanceTimersByTimeAsync(15_000)
    handlers.get('quality-report')?.(report)
    expect(write).toHaveBeenCalledTimes(2)
    write.mockRejectedValue(new Error('offline'))
    handlers.get('call-quality-summary')?.({
      totalDurationMs: 20_000,
      qualityBreakdown: {},
      worstMetrics: {},
      averageMetrics: {},
    })
    await vi.advanceTimersByTimeAsync(1)
    detach()
    expect(handlers.size).toBe(0)
  })
})
