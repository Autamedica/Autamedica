'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Bug, RefreshCw, Trash2 } from 'lucide-react'
import { createCallService } from './calls/service'
import type { CallEvent } from './calls/types'
import type { TelemedicineDebugRecord } from './debug'
import {
  clearTelemedicineDebugEvents,
  readTelemedicineDebugEvents,
  subscribeToTelemedicineDebugEvents,
} from './debug'

export interface TelemedicineDebugPanelProps {
  callId?: string
  roomId?: string
  title?: string
  className?: string
  initiallyOpen?: boolean
  compact?: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function normalizeRemoteEvent(event: CallEvent): TelemedicineDebugRecord {
  const payload = isPlainObject(event.payload) ? event.payload : {}
  const nestedPayload = isPlainObject(payload.payload) ? payload.payload : undefined
  const source = getString(payload, 'source') ?? 'CallEvents'
  const level = getString(payload, 'level')
  const message = getString(payload, 'message') ?? event.type.replace(/_/g, ' ')
  const roomId = getString(payload, 'roomId') ?? getString(payload, 'room_id')

  return {
    id: `remote-${event.id}`,
    at: event.at,
    level: level === 'warn' || level === 'error' ? level : 'info',
    source,
    callId: event.call_id,
    roomId,
    userId: getString(payload, 'userId'),
    userType: getString(payload, 'userType'),
    message,
    payload: nestedPayload ?? payload,
  }
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString()
}

function levelBadgeClasses(level: TelemedicineDebugRecord['level']): string {
  switch (level) {
    case 'error':
      return 'border-red-500/40 bg-red-500/15 text-red-200'
    case 'warn':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-200'
    default:
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
  }
}

function latestRecordWithPayload(
  events: TelemedicineDebugRecord[],
  predicate: (payload: Record<string, unknown>) => boolean,
): TelemedicineDebugRecord | undefined {
  return events.find((event) => isPlainObject(event.payload) && predicate(event.payload))
}

function getNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' ? value : undefined
}

function deriveSessionSummary(events: TelemedicineDebugRecord[]) {
  const runtimeRecord = latestRecordWithPayload(events, (payload) => typeof payload.runtime === 'string')
  const turnRecord = latestRecordWithPayload(events, (payload) => typeof payload.hasTurn === 'boolean')
  const stateRecord = latestRecordWithPayload(
    events,
    (payload) => typeof payload.state === 'string' && payload.state.length > 0,
  )
  const initRecord = latestRecordWithPayload(
    events,
    (payload) => typeof payload.providerType === 'string' || typeof payload.iceServerCount === 'number',
  )

  // Metrics from persisted call_events
  const firstMediaRecord = events.find((e) => e.message === 'first remote media' || (isPlainObject(e.payload) && typeof (e.payload as Record<string, unknown>).timeToFirstRemoteMediaMs === 'number'))
  const firstMediaPayload = isPlainObject(firstMediaRecord?.payload) ? firstMediaRecord.payload as Record<string, unknown> : undefined
  const timeToFirstMedia = firstMediaPayload ? getNumber(firstMediaPayload, 'timeToFirstRemoteMediaMs') : undefined

  const reconnectEvents = events.filter((e) => e.message.toLowerCase().includes('reconectando') || e.message.toLowerCase().includes('reconnecting'))
  const reconnectCount = reconnectEvents.length

  const lastErrorRecord = events.find((e) => e.level === 'error' && isPlainObject(e.payload) && typeof (e.payload as Record<string, unknown>).failureCode === 'string')
  const lastErrorPayload = isPlainObject(lastErrorRecord?.payload) ? lastErrorRecord.payload as Record<string, unknown> : undefined
  const lastFailureCode = lastErrorPayload ? getString(lastErrorPayload, 'failureCode') : undefined

  const joinSucceeded = events.some((e) => e.message === 'join succeeded' || (isPlainObject(e.payload) && (e.payload as Record<string, unknown>).joinSucceeded === true))

  return {
    runtime: getString((runtimeRecord?.payload as Record<string, unknown>) ?? {}, 'runtime') ?? 'sin dato',
    providerType: getString((initRecord?.payload as Record<string, unknown>) ?? {}, 'providerType') ?? 'sin dato',
    hasTurn: (() => {
      const value = turnRecord?.payload && isPlainObject(turnRecord.payload) ? turnRecord.payload.hasTurn : undefined
      return typeof value === 'boolean' ? value : undefined
    })(),
    iceServerCount: (() => {
      const value = initRecord?.payload && isPlainObject(initRecord.payload) ? initRecord.payload.iceServerCount : undefined
      return typeof value === 'number' ? value : undefined
    })(),
    connectionState: getString((stateRecord?.payload as Record<string, unknown>) ?? {}, 'state') ?? 'sin dato',
    timeToFirstMedia,
    reconnectCount,
    lastFailureCode,
    joinSucceeded,
  }
}

function summaryPillClasses(kind: 'info' | 'good' | 'warn' | 'bad'): string {
  switch (kind) {
    case 'good':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    case 'warn':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    case 'bad':
      return 'border-red-500/30 bg-red-500/10 text-red-200'
    default:
      return 'border-slate-700 bg-slate-900 text-slate-200'
  }
}

export function TelemedicineDebugPanel({
  callId,
  roomId,
  title = 'Timeline de telemedicina',
  className = '',
  initiallyOpen = false,
  compact = true,
}: TelemedicineDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const [localEvents, setLocalEvents] = useState<TelemedicineDebugRecord[]>([])
  const [remoteEvents, setRemoteEvents] = useState<TelemedicineDebugRecord[]>([])
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadLocalEvents = useCallback(() => {
    setLocalEvents(readTelemedicineDebugEvents({ callId, roomId }))
  }, [callId, roomId])

  const loadRemoteEvents = useCallback(async () => {
    if (!callId) {
      setRemoteEvents([])
      setRemoteError(null)
      return
    }

    setIsRefreshing(true)
    try {
      const callService = createCallService()
      const events = await callService.getCallEvents(callId)
      setRemoteEvents(events.map((event) => normalizeRemoteEvent(event)))
      setRemoteError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible leer call_events'
      setRemoteError(message)
    } finally {
      setIsRefreshing(false)
    }
  }, [callId])

  useEffect(() => {
    loadLocalEvents()
    return subscribeToTelemedicineDebugEvents(loadLocalEvents)
  }, [loadLocalEvents])

  useEffect(() => {
    void loadRemoteEvents()
  }, [loadRemoteEvents])

  useEffect(() => {
    if (!callId) {
      return () => {}
    }

    try {
      const callService = createCallService()
      const unsubscribe = callService.subscribeToCallEvents(callId, (event) => {
        setRemoteEvents((previous) => {
          const next = [...previous.filter((item) => item.id !== `remote-${event.id}`), normalizeRemoteEvent(event)]
          return next.sort((left, right) => left.at.localeCompare(right.at))
        })
        setRemoteError(null)
      })

      return unsubscribe
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible suscribirse a call_events'
      setRemoteError(message)
      return () => {}
    }
  }, [callId])

  const events = useMemo(() => {
    const merged = [...localEvents, ...remoteEvents]
    const unique = new Map(merged.map((event) => [event.id, event]))
    return Array.from(unique.values()).sort((left, right) => right.at.localeCompare(left.at))
  }, [localEvents, remoteEvents])
  const sessionSummary = useMemo(() => deriveSessionSummary(events), [events])

  const handleClearLocal = () => {
    clearTelemedicineDebugEvents({ callId, roomId })
    loadLocalEvents()
  }

  const summaryCount = events.length

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur-xl ${compact ? 'w-[22rem] max-w-[calc(100vw-2rem)]' : 'w-full max-w-xl'} ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Bug className="h-4 w-4" />
            Debug
          </div>
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          <p className="truncate text-xs text-slate-400">
            {callId ? `callId ${callId}` : 'sin callId'} {roomId ? `• roomId ${roomId}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-300">
            {summaryCount} eventos
          </span>
          <button
            type="button"
            onClick={() => {
              void loadRemoteEvents()
            }}
            className="rounded-lg border border-slate-700 px-2 py-2 text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
            title="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleClearLocal}
            className="rounded-lg border border-slate-700 px-2 py-2 text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
            title="Limpiar logs locales"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen((previous) => !previous)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
          >
            {isOpen ? 'Cerrar' : 'Abrir'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-3 p-4">
          {remoteError && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{remoteError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-xl border px-3 py-2 ${summaryPillClasses('info')}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Runtime</p>
              <p className="mt-1 text-sm font-semibold text-white">{sessionSummary.runtime}</p>
              <p className="mt-1 text-[11px] text-slate-400">{sessionSummary.providerType}</p>
            </div>

            <div
              className={`rounded-xl border px-3 py-2 ${
                sessionSummary.hasTurn === true
                  ? summaryPillClasses('good')
                  : sessionSummary.hasTurn === false
                    ? summaryPillClasses('warn')
                    : summaryPillClasses('info')
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">TURN</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {sessionSummary.hasTurn === true ? 'Disponible' : sessionSummary.hasTurn === false ? 'Ausente' : 'Sin dato'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {typeof sessionSummary.iceServerCount === 'number'
                  ? `${sessionSummary.iceServerCount} ICE server${sessionSummary.iceServerCount === 1 ? '' : 's'}`
                  : 'sin conteo'}
              </p>
            </div>

            <div
              className={`col-span-2 rounded-xl border px-3 py-2 ${
                sessionSummary.connectionState === 'connected'
                  ? summaryPillClasses('good')
                  : sessionSummary.connectionState === 'failed'
                    ? summaryPillClasses('bad')
                    : sessionSummary.connectionState === 'connecting'
                      ? summaryPillClasses('warn')
                      : summaryPillClasses('info')
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Sesion</p>
              <p className="mt-1 text-sm font-semibold text-white">{sessionSummary.connectionState}</p>
            </div>

            <div className={`rounded-xl border px-3 py-2 ${
              sessionSummary.timeToFirstMedia !== undefined
                ? sessionSummary.timeToFirstMedia < 4000 ? summaryPillClasses('good')
                  : sessionSummary.timeToFirstMedia < 8000 ? summaryPillClasses('warn')
                    : summaryPillClasses('bad')
                : summaryPillClasses('info')
            }`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">1er media</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {sessionSummary.timeToFirstMedia !== undefined
                  ? `${(sessionSummary.timeToFirstMedia / 1000).toFixed(1)}s`
                  : 'sin dato'}
              </p>
            </div>

            <div className={`rounded-xl border px-3 py-2 ${
              sessionSummary.reconnectCount === 0
                ? summaryPillClasses('good')
                : sessionSummary.reconnectCount <= 2
                  ? summaryPillClasses('warn')
                  : summaryPillClasses('bad')
            }`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Reconexiones</p>
              <p className="mt-1 text-sm font-semibold text-white">{sessionSummary.reconnectCount}</p>
            </div>

            {sessionSummary.lastFailureCode && (
              <div className={`col-span-2 rounded-xl border px-3 py-2 ${summaryPillClasses('bad')}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Ultimo error</p>
                <p className="mt-1 text-sm font-mono font-semibold text-white">{sessionSummary.lastFailureCode}</p>
              </div>
            )}
          </div>

          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
                Todavia no hay eventos para esta llamada.
              </div>
            ) : (
              events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${levelBadgeClasses(event.level)}`}>
                          {event.level}
                        </span>
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {event.source}
                        </p>
                      </div>
                      <p className="text-sm font-medium leading-5 text-slate-100">{event.message}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-500">{formatTime(event.at)}</span>
                  </div>

                  {(event.userType || event.userId || event.roomId) && (
                    <p className="mb-2 text-xs text-slate-400">
                      {event.userType ? `${event.userType}` : 'usuario'} {event.userId ? `• ${event.userId}` : ''}
                      {event.roomId ? ` • ${event.roomId}` : ''}
                    </p>
                  )}

                  {event.payload && Object.keys(event.payload).length > 0 && (
                    <details className="rounded-lg border border-slate-800 bg-black/20">
                      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Ver payload
                      </summary>
                      <pre className="overflow-x-auto border-t border-slate-800 px-3 py-3 text-[11px] leading-5 text-slate-300">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
