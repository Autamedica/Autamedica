import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCallLogger } from './call-logger'
import type { CallLogContext, CallLogEntry } from './call-logger'

function makeContext(overrides?: Partial<CallLogContext>): CallLogContext {
  return {
    callId: 'call-abc-123',
    roomId: 'room-xyz',
    userId: 'user-1',
    userRole: 'doctor',
    ...overrides,
  }
}

describe('createCallLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('crea un logger que emite entradas con el contexto correcto', () => {
    const ctx = makeContext()
    const logger = createCallLogger(ctx, { console: false })

    logger.info('lifecycle', 'call_started', { autoStart: true })

    const entries = logger.getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].level).toBe('info')
    expect(entries[0].category).toBe('lifecycle')
    expect(entries[0].event).toBe('call_started')
    expect(entries[0].context).toEqual(ctx)
    expect(entries[0].data).toEqual({ autoStart: true })
    expect(entries[0].timestamp).toBeTruthy()
  })

  it('soporta los 4 niveles de log', () => {
    const logger = createCallLogger(makeContext(), { console: false })

    logger.debug('ice', 'candidate_gathered')
    logger.info('signaling', 'ws_connected')
    logger.warn('quality', 'quality_degraded')
    logger.error('lifecycle', 'call_failed', { reason: 'timeout' })

    const entries = logger.getEntries()
    expect(entries).toHaveLength(4)
    expect(entries.map((e) => e.level)).toEqual(['debug', 'info', 'warn', 'error'])
  })

  it('respeta minLevel filtrando entradas por debajo del umbral', () => {
    const logger = createCallLogger(makeContext(), { console: false, minLevel: 'warn' })

    logger.debug('ice', 'debug_event')
    logger.info('ice', 'info_event')
    logger.warn('ice', 'warn_event')
    logger.error('ice', 'error_event')

    const entries = logger.getEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].event).toBe('warn_event')
    expect(entries[1].event).toBe('error_event')
  })

  it('mantiene un buffer circular de maximo 100 entradas', () => {
    const logger = createCallLogger(makeContext(), { console: false })

    for (let i = 0; i < 120; i++) {
      logger.info('lifecycle', `event_${i}`)
    }

    const entries = logger.getEntries()
    expect(entries).toHaveLength(100)
    // El primero deberia ser event_20 (los primeros 20 se descartaron)
    expect(entries[0].event).toBe('event_20')
    expect(entries[99].event).toBe('event_119')
  })

  it('startTimer registra la duracion al finalizar', () => {
    const logger = createCallLogger(makeContext(), { console: false })

    const stop = logger.startTimer('signaling', 'ws_connect')
    // Simular algo de tiempo
    stop()

    const entries = logger.getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].event).toBe('ws_connect_completed')
    expect(entries[0].category).toBe('signaling')
    expect(typeof entries[0].duration).toBe('number')
    expect(entries[0].duration).toBeGreaterThanOrEqual(0)
  })

  it('getContext retorna una copia del contexto', () => {
    const ctx = makeContext({ sessionId: 'session-1' })
    const logger = createCallLogger(ctx, { console: false })

    const returned = logger.getContext()
    expect(returned).toEqual(ctx)
    expect(returned).not.toBe(ctx) // copia, no referencia
  })

  it('subscribe notifica cada nueva entrada', () => {
    const logger = createCallLogger(makeContext(), { console: false })
    const received: CallLogEntry[] = []

    const unsub = logger.subscribe((entry) => received.push(entry))

    logger.info('lifecycle', 'event_a')
    logger.warn('ice', 'event_b')

    expect(received).toHaveLength(2)
    expect(received[0].event).toBe('event_a')
    expect(received[1].event).toBe('event_b')

    unsub()
    logger.info('lifecycle', 'event_c')
    expect(received).toHaveLength(2) // no mas notificaciones
  })

  it('serializa errores en data sin romper', () => {
    const logger = createCallLogger(makeContext(), { console: false })

    const err = new Error('test error')
    logger.error('lifecycle', 'call_failed', { error: err })

    const entries = logger.getEntries()
    expect(entries[0].data?.error).toEqual({
      name: 'Error',
      message: 'test error',
      stack: err.stack,
    })
  })

  it('loguea a console cuando console: true', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const logger = createCallLogger(makeContext(), { console: true })

    logger.info('lifecycle', 'test_event')

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toContain('[Call:call-abc')
    expect(spy.mock.calls[0][0]).toContain('[lifecycle]')
    spy.mockRestore()
  })

  it('usa console.error para nivel error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createCallLogger(makeContext(), { console: true })

    logger.error('lifecycle', 'boom')

    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('funciona sin data opcional', () => {
    const logger = createCallLogger(makeContext(), { console: false })

    logger.info('signaling', 'ws_connected')

    const entries = logger.getEntries()
    expect(entries[0].data).toBeUndefined()
  })
})
