import { logger } from '@autamedica/shared'

export type TelemedicineDebugLevel = 'info' | 'warn' | 'error'

export interface TelemedicineDebugContext {
  source: string
  callId?: string
  roomId?: string
  userId?: string
  userType?: string
}

export interface TelemedicineDebugRecord extends TelemedicineDebugContext {
  id: string
  at: string
  level: TelemedicineDebugLevel
  message: string
  payload?: Record<string, unknown>
}

export interface TelemedicineDebugFilter {
  callId?: string
  roomId?: string
}

const STORAGE_KEY = 'autamedica:telemedicine:debug:v1'
const STORAGE_LIMIT = 400
const UPDATE_EVENT = 'autamedica:telemedicine:debug-updated'

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeUnknown(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeUnknown(item))
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeUnknown(nestedValue)])
    )
  }

  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
  ) {
    return value
  }

  if (typeof value === 'undefined') {
    return 'undefined'
  }

  return String(value)
}

function normalizePayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, normalizeUnknown(value)])
  )
}

function readStorage(): TelemedicineDebugRecord[] {
  if (!isBrowser()) {
    return []
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as TelemedicineDebugRecord[]) : []
  } catch {
    return []
  }
}

function writeStorage(records: TelemedicineDebugRecord[]): void {
  if (!isBrowser()) {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-STORAGE_LIMIT)))
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
  } catch {
    // Ignore storage quota / serialization errors in debug pipeline.
  }
}

function matchesFilter(record: TelemedicineDebugRecord, filter?: TelemedicineDebugFilter): boolean {
  if (!filter) {
    return true
  }

  if (filter.callId && record.callId !== filter.callId) {
    return false
  }

  if (filter.roomId && record.roomId !== filter.roomId) {
    return false
  }

  return true
}

function writeConsole(record: TelemedicineDebugRecord): void {
  const message = `[Telemedicine][${record.source}] ${record.message}`
  const context = Object.fromEntries(
    Object.entries({
      callId: record.callId,
      roomId: record.roomId,
      userId: record.userId,
      userType: record.userType,
      payload: record.payload,
    }).filter(([, value]) => typeof value !== 'undefined')
  )

  switch (record.level) {
    case 'error':
      logger.error(message, context)
      break
    case 'warn':
      logger.warn(message, context)
      break
    default:
      logger.info(message, context)
      break
  }
}

export function recordTelemedicineDebugEvent(
  level: TelemedicineDebugLevel,
  context: TelemedicineDebugContext,
  message: string,
  payload?: Record<string, unknown>,
): TelemedicineDebugRecord {
  const record: TelemedicineDebugRecord = {
    id: `${context.source}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    level,
    source: context.source,
    callId: context.callId,
    roomId: context.roomId,
    userId: context.userId,
    userType: context.userType,
    message,
    payload: normalizePayload(payload),
  }

  writeConsole(record)
  writeStorage([...readStorage(), record])
  return record
}

export function createTelemedicineLogger(context: TelemedicineDebugContext) {
  return {
    info(message: string, payload?: Record<string, unknown>): TelemedicineDebugRecord {
      return recordTelemedicineDebugEvent('info', context, message, payload)
    },
    warn(message: string, payload?: Record<string, unknown>): TelemedicineDebugRecord {
      return recordTelemedicineDebugEvent('warn', context, message, payload)
    },
    error(
      message: string,
      error?: unknown,
      payload?: Record<string, unknown>,
    ): TelemedicineDebugRecord {
      const normalizedPayload = payload ?? {}
      if (typeof error !== 'undefined') {
        normalizedPayload.error = normalizeUnknown(error)
      }

      return recordTelemedicineDebugEvent('error', context, message, normalizedPayload)
    },
  }
}

export function readTelemedicineDebugEvents(
  filter?: TelemedicineDebugFilter,
): TelemedicineDebugRecord[] {
  return readStorage().filter((record) => matchesFilter(record, filter))
}

export function clearTelemedicineDebugEvents(filter?: TelemedicineDebugFilter): void {
  if (!filter) {
    writeStorage([])
    return
  }

  const nextRecords = readStorage().filter((record) => !matchesFilter(record, filter))
  writeStorage(nextRecords)
}

export function subscribeToTelemedicineDebugEvents(
  callback: () => void,
): () => void {
  if (!isBrowser()) {
    return () => {}
  }

  const listener = () => callback()
  window.addEventListener(UPDATE_EVENT, listener)
  window.addEventListener('storage', listener)

  return () => {
    window.removeEventListener(UPDATE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
