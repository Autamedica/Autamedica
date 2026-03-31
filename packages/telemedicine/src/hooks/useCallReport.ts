'use client'

import { useState, useEffect, useRef } from 'react'
import type { CallLogCollector, CallSummary } from '../logging/call-log-collector'
import type { CallLogEntry } from '../logging/call-logger'
import type { CallLogger } from '../logging/call-logger'

export interface CallReportState {
  summary: CallSummary | null
  logs: CallLogEntry[]
}

/**
 * Hook que genera un reporte de la llamada cuando termina.
 * Escucha las entradas del logger en tiempo real y produce el summary
 * cuando se llama a `finalize()`.
 */
export function useCallReport(
  collector: CallLogCollector | null,
  logger: CallLogger | null,
): CallReportState & { finalize: () => void } {
  const [summary, setSummary] = useState<CallSummary | null>(null)
  const [logs, setLogs] = useState<CallLogEntry[]>([])
  const collectorRef = useRef(collector)
  const loggerRef = useRef(logger)
  collectorRef.current = collector
  loggerRef.current = logger

  // Sync live logs from the logger buffer
  useEffect(() => {
    if (!logger) return
    const unsub = logger.subscribe(() => {
      setLogs(logger.getEntries())
    })
    return unsub
  }, [logger])

  function finalize() {
    if (collectorRef.current) {
      const s = collectorRef.current.getSummary()
      setSummary(s)
    }
    if (loggerRef.current) {
      setLogs(loggerRef.current.getEntries())
    }
  }

  return { summary, logs, finalize }
}
