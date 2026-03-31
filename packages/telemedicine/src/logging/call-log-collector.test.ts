import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCallLogger } from './call-logger'
import { createCallLogCollector } from './call-log-collector'
import type { CallLogContext } from './call-logger'

function makeContext(overrides?: Partial<CallLogContext>): CallLogContext {
  return {
    callId: 'call-test-001',
    roomId: 'room-test',
    userId: 'doctor-1',
    userRole: 'doctor',
    ...overrides,
  }
}

describe('createCallLogCollector', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('genera un summary basico con callId y roomId del contexto', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.info('lifecycle', 'call_started')

    const summary = collector.getSummary()
    expect(summary.callId).toBe('call-test-001')
    expect(summary.roomId).toBe('room-test')
    expect(summary.startedAt).toBeTruthy()
    expect(summary.endedAt).toBeTruthy()
    expect(summary.durationMs).toBeGreaterThanOrEqual(0)

    collector.dispose()
  })

  it('trackea participantes via peer_connected y user_left', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.info('lifecycle', 'peer_connected', { peerId: 'patient-1', role: 'patient' })
    logger.info('lifecycle', 'user_left', { peerId: 'patient-1' })

    const summary = collector.getSummary()
    expect(summary.participants).toHaveLength(1)
    expect(summary.participants[0].userId).toBe('patient-1')
    expect(summary.participants[0].role).toBe('patient')
    expect(summary.participants[0].joinedAt).toBeTruthy()
    expect(summary.participants[0].leftAt).toBeTruthy()

    collector.dispose()
  })

  it('rellena leftAt para participantes que siguen en la llamada', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.info('lifecycle', 'peer_connected', { peerId: 'patient-2', role: 'patient' })
    logger.info('lifecycle', 'some_event')

    const summary = collector.getSummary()
    expect(summary.participants[0].leftAt).toBeTruthy()
    // leftAt deberia ser >= joinedAt
    expect(new Date(summary.participants[0].leftAt).getTime())
      .toBeGreaterThanOrEqual(new Date(summary.participants[0].joinedAt).getTime())

    collector.dispose()
  })

  it('calcula quality distribution de los samples', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    // 2 excellent, 1 good, 1 poor = 50% excellent, 25% good, 0% fair, 25% poor
    logger.info('quality', 'quality_report', { level: 'excellent', bitrateKbps: 2000, packetLoss: 0.5, rttMs: 50 })
    logger.info('quality', 'quality_report', { level: 'excellent', bitrateKbps: 1800, packetLoss: 0.3, rttMs: 60 })
    logger.info('quality', 'quality_report', { level: 'good', bitrateKbps: 1200, packetLoss: 1.5, rttMs: 120 })
    logger.info('quality', 'quality_report', { level: 'poor', bitrateKbps: 300, packetLoss: 8.0, rttMs: 400 })

    const summary = collector.getSummary()
    expect(summary.metrics.qualityDistribution.excellent).toBe(50)
    expect(summary.metrics.qualityDistribution.good).toBe(25)
    expect(summary.metrics.qualityDistribution.fair).toBe(0)
    expect(summary.metrics.qualityDistribution.poor).toBe(25)

    collector.dispose()
  })

  it('calcula promedios de metricas', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.info('quality', 'quality_report', { level: 'good', bitrateKbps: 1000, packetLoss: 2.0, rttMs: 100 })
    logger.info('quality', 'quality_report', { level: 'good', bitrateKbps: 2000, packetLoss: 4.0, rttMs: 200 })

    const summary = collector.getSummary()
    expect(summary.metrics.avgBitrateKbps).toBe(1500)
    expect(summary.metrics.avgPacketLoss).toBe(3)
    expect(summary.metrics.avgRttMs).toBe(150)

    collector.dispose()
  })

  it('cuenta ICE restarts', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.warn('ice', 'ice_restart', { peerId: 'p1', attempt: 1 })
    logger.warn('ice', 'ice_restart', { peerId: 'p1', attempt: 2 })
    logger.warn('ice', 'ice_restart_attempted', { peerId: 'p1', attempt: 3 })

    const summary = collector.getSummary()
    expect(summary.metrics.iceRestarts).toBe(3)

    collector.dispose()
  })

  it('detecta uso de TURN', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    expect(collector.getSummary().metrics.turnUsed).toBe(false)

    logger.info('turn', 'turn_refresh', { peerId: 'p1' })

    expect(collector.getSummary().metrics.turnUsed).toBe(true)

    collector.dispose()
  })

  it('detecta auto downgrade a audio-only', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.warn('quality', 'audio_only_fallback', { reason: 'poor_quality' })

    expect(collector.getSummary().metrics.autoDowngraded).toBe(true)

    collector.dispose()
  })

  it('marca outcome como failed cuando hay error en lifecycle', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.error('lifecycle', 'call_failed', { reason: 'ice_timeout' })

    const summary = collector.getSummary()
    expect(summary.outcome).toBe('failed')
    expect(summary.failureReason).toBe('ice_timeout')

    collector.dispose()
  })

  it('marca outcome como dropped cuando se pierde conexion', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.warn('lifecycle', 'call_dropped')

    expect(collector.getSummary().outcome).toBe('dropped')

    collector.dispose()
  })

  it('marca outcome como cancelled', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.info('lifecycle', 'call_cancelled')

    expect(collector.getSummary().outcome).toBe('cancelled')

    collector.dispose()
  })

  it('timeline de eventos excluye debug', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.debug('ice', 'verbose_debug')
    logger.info('lifecycle', 'call_started')
    logger.warn('quality', 'quality_degraded')

    const summary = collector.getSummary()
    expect(summary.events).toHaveLength(2)
    expect(summary.events[0].event).toBe('call_started')
    expect(summary.events[1].event).toBe('quality_degraded')

    collector.dispose()
  })

  it('dispose deja de escuchar nuevas entradas', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.info('lifecycle', 'before_dispose')
    collector.dispose()
    logger.info('lifecycle', 'after_dispose')

    const summary = collector.getSummary()
    expect(summary.events).toHaveLength(1)
    expect(summary.events[0].event).toBe('before_dispose')
  })

  it('quality distribution vacia si no hay samples', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.info('lifecycle', 'call_started')

    const summary = collector.getSummary()
    expect(summary.metrics.qualityDistribution).toEqual({
      excellent: 0, good: 0, fair: 0, poor: 0,
    })

    collector.dispose()
  })

  it('acepta metricas con nombres alternativos (inboundVideoBitrateKbps, packetsLostPct, roundTripTimeMs)', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const collector = createCallLogCollector(logger)

    logger.info('quality', 'quality_report', {
      level: 'good',
      inboundVideoBitrateKbps: 1500,
      packetsLostPct: 1.2,
      roundTripTimeMs: 80,
    })

    const summary = collector.getSummary()
    expect(summary.metrics.avgBitrateKbps).toBe(1500)
    expect(summary.metrics.avgPacketLoss).toBe(1.2)
    expect(summary.metrics.avgRttMs).toBe(80)

    collector.dispose()
  })
})
