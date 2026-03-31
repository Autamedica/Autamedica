import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AutoDegradeService } from './auto-degrade'
import type { StreamQualityLevel } from './types'

describe('AutoDegradeService', () => {
  let onDegrade: ReturnType<typeof vi.fn>
  let onRecover: ReturnType<typeof vi.fn>
  let service: AutoDegradeService

  beforeEach(() => {
    onDegrade = vi.fn()
    onRecover = vi.fn()
    vi.useFakeTimers()
  })

  function createService(overrides?: { poorQualityThresholdMs?: number; recoveryThresholdMs?: number }) {
    service = new AutoDegradeService({
      onDegrade,
      onRecover,
      poorQualityThresholdMs: overrides?.poorQualityThresholdMs ?? 30_000,
      recoveryThresholdMs: overrides?.recoveryThresholdMs ?? 15_000,
    })
    return service
  }

  it('does not degrade before threshold is reached', () => {
    createService()

    // Simulate poor quality for 25 seconds (below 30s threshold)
    service.update('poor')
    vi.advanceTimersByTime(25_000)
    service.update('poor')

    expect(onDegrade).not.toHaveBeenCalled()
  })

  it('degrades to audio-only after 30s of poor quality', () => {
    createService()

    service.update('poor')
    vi.advanceTimersByTime(30_000)
    service.update('poor')

    expect(onDegrade).toHaveBeenCalledWith('audio-only')
    expect(service.isAutoDegraded).toBe(true)
  })

  it('resets poor timer when quality improves', () => {
    createService()

    service.update('poor')
    vi.advanceTimersByTime(20_000)

    // Quality improves
    service.update('good')
    vi.advanceTimersByTime(5_000)

    // Goes poor again — timer resets
    service.update('poor')
    vi.advanceTimersByTime(25_000)
    service.update('poor')

    // 25s < 30s threshold, should NOT degrade
    expect(onDegrade).not.toHaveBeenCalled()
  })

  it('does not recover until good quality sustained for recovery threshold', () => {
    createService({ poorQualityThresholdMs: 100, recoveryThresholdMs: 15_000 })

    // Degrade first
    service.update('poor')
    vi.advanceTimersByTime(100)
    service.update('poor')
    expect(service.isAutoDegraded).toBe(true)

    // Recover for 10s — not enough
    service.update('good')
    vi.advanceTimersByTime(10_000)
    service.update('good')

    expect(onRecover).not.toHaveBeenCalled()
    expect(service.isAutoDegraded).toBe(true)
  })

  it('recovers after sustained good quality', () => {
    createService({ poorQualityThresholdMs: 100, recoveryThresholdMs: 15_000 })

    // Degrade
    service.update('poor')
    vi.advanceTimersByTime(100)
    service.update('poor')
    expect(service.isAutoDegraded).toBe(true)

    // Recover for 15s
    service.update('good')
    vi.advanceTimersByTime(15_000)
    service.update('good')

    expect(onRecover).toHaveBeenCalled()
    expect(service.isAutoDegraded).toBe(false)
  })

  it('resets recovery timer if quality dips during recovery', () => {
    createService({ poorQualityThresholdMs: 100, recoveryThresholdMs: 15_000 })

    // Degrade
    service.update('poor')
    vi.advanceTimersByTime(100)
    service.update('poor')

    // Start recovery
    service.update('good')
    vi.advanceTimersByTime(10_000)

    // Dip to fair — resets recovery
    service.update('fair')
    vi.advanceTimersByTime(1_000)

    // Good again — timer restarts
    service.update('good')
    vi.advanceTimersByTime(14_000)
    service.update('good')

    // 14s < 15s — should NOT have recovered yet
    expect(onRecover).not.toHaveBeenCalled()

    // 1 more second
    vi.advanceTimersByTime(1_000)
    service.update('good')

    expect(onRecover).toHaveBeenCalled()
  })

  it('excellent quality also counts toward recovery', () => {
    createService({ poorQualityThresholdMs: 100, recoveryThresholdMs: 15_000 })

    service.update('poor')
    vi.advanceTimersByTime(100)
    service.update('poor')

    service.update('excellent')
    vi.advanceTimersByTime(15_000)
    service.update('excellent')

    expect(onRecover).toHaveBeenCalled()
  })

  it('reset clears all state', () => {
    createService({ poorQualityThresholdMs: 100 })

    service.update('poor')
    vi.advanceTimersByTime(100)
    service.update('poor')
    expect(service.isAutoDegraded).toBe(true)

    service.reset()
    expect(service.isAutoDegraded).toBe(false)

    // After reset, need full 100ms of poor again
    service.update('poor')
    expect(onDegrade).toHaveBeenCalledTimes(1) // only the first time
  })

  it('does not degrade on fair quality', () => {
    createService()

    service.update('fair' as StreamQualityLevel)
    vi.advanceTimersByTime(60_000)
    service.update('fair' as StreamQualityLevel)

    expect(onDegrade).not.toHaveBeenCalled()
  })

  it('only calls onDegrade once per degradation cycle', () => {
    createService({ poorQualityThresholdMs: 100 })

    service.update('poor')
    vi.advanceTimersByTime(100)
    service.update('poor')
    vi.advanceTimersByTime(100)
    service.update('poor')
    vi.advanceTimersByTime(100)
    service.update('poor')

    expect(onDegrade).toHaveBeenCalledTimes(1)
  })
})
