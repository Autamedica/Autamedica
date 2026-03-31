/**
 * Structured JSON logger for telemedicine calls.
 * Binds a correlation context (callId, roomId, userId, userRole) to every entry
 * so the full lifecycle of a call can be traced end-to-end.
 *
 * Zero external dependencies. All output is structured JSON.
 */

export type CallLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type CallLogCategory =
  | 'signaling'
  | 'ice'
  | 'media'
  | 'quality'
  | 'chat'
  | 'recording'
  | 'turn'
  | 'lifecycle'

export interface CallLogContext {
  callId: string
  roomId: string
  userId: string
  userRole: 'doctor' | 'patient'
  sessionId?: string
}

export interface CallLogEntry {
  timestamp: string
  level: CallLogLevel
  category: CallLogCategory
  event: string
  context: CallLogContext
  data?: Record<string, unknown>
  duration?: number
}

export interface CallLogger {
  debug(category: CallLogCategory, event: string, data?: Record<string, unknown>): void
  info(category: CallLogCategory, event: string, data?: Record<string, unknown>): void
  warn(category: CallLogCategory, event: string, data?: Record<string, unknown>): void
  error(category: CallLogCategory, event: string, data?: Record<string, unknown>): void
  startTimer(category: CallLogCategory, event: string): () => void
  getEntries(): CallLogEntry[]
  getContext(): CallLogContext
  subscribe(listener: (entry: CallLogEntry) => void): () => void
}

const BUFFER_LIMIT = 100

const LEVEL_PRIORITY: Record<CallLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function shouldLog(entryLevel: CallLogLevel, minLevel: CallLogLevel): boolean {
  return LEVEL_PRIORITY[entryLevel] >= LEVEL_PRIORITY[minLevel]
}

function safeSerialize(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Error) {
      result[key] = { name: value.name, message: value.message, stack: value.stack }
    } else if (typeof value === 'function' || typeof value === 'symbol') {
      result[key] = String(value)
    } else {
      result[key] = value
    }
  }
  return result
}

export function createCallLogger(
  context: CallLogContext,
  options?: { minLevel?: CallLogLevel; console?: boolean },
): CallLogger {
  const buffer: CallLogEntry[] = []
  const listeners = new Set<(entry: CallLogEntry) => void>()
  const minLevel = options?.minLevel ?? 'debug'
  const writeConsole = options?.console ?? true

  function emit(level: CallLogLevel, category: CallLogCategory, event: string, data?: Record<string, unknown>, duration?: number): void {
    if (!shouldLog(level, minLevel)) return

    const entry: CallLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      event,
      context,
      ...(data !== undefined && { data: safeSerialize(data) }),
      ...(duration !== undefined && { duration }),
    }

    // Ring buffer
    buffer.push(entry)
    if (buffer.length > BUFFER_LIMIT) {
      buffer.shift()
    }

    // Console output as structured JSON
    if (writeConsole) {
      const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'log'
      console[method](`[Call:${context.callId.slice(0, 8)}] [${category}] ${event}`, JSON.stringify(entry))
    }

    for (const listener of listeners) {
      try {
        listener(entry)
      } catch {
        // No propagation de errores del listener
      }
    }
  }

  return {
    debug(category, event, data) {
      emit('debug', category, event, data)
    },
    info(category, event, data) {
      emit('info', category, event, data)
    },
    warn(category, event, data) {
      emit('warn', category, event, data)
    },
    error(category, event, data) {
      emit('error', category, event, data)
    },
    startTimer(category, event) {
      const start = performance.now()
      return () => {
        const duration = Math.round(performance.now() - start)
        emit('info', category, `${event}_completed`, undefined, duration)
      }
    },
    getEntries() {
      return [...buffer]
    },
    getContext() {
      return { ...context }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
