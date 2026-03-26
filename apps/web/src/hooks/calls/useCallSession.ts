'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CallSessionBootstrap } from '@autamedica/telemedicine'
import { logger } from '@autamedica/shared'
import { callSessionService } from '@/lib/calls/services/call-session.service'

interface UseCallSessionResult {
  session: CallSessionBootstrap | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

function normalizeCallSessionError(message: string): string {
  switch (message) {
    case 'call_ended':
      return 'Esta videollamada ya terminó. Volvé a tu turno para abrir una sala vigente.'
    case 'call_canceled':
      return 'Esta videollamada fue cancelada.'
    case 'call_declined':
      return 'La videollamada fue rechazada y ya no está disponible.'
    case 'call_not_found':
      return 'No encontramos una videollamada disponible para este turno.'
    default:
      return message
  }
}

export function useCallSession(roomId: string, enabled = true): UseCallSessionResult {
  const [session, setSession] = useState<CallSessionBootstrap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled || !roomId.trim()) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await callSessionService.getBootstrap(roomId)
      setSession(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo preparar la llamada'
      logger.error('[useCallSession] refresh failed', err)
      setSession(null)
      setError(normalizeCallSessionError(message))
    } finally {
      setLoading(false)
    }
  }, [enabled, roomId])

  useEffect(() => {
    if (!enabled) {
      return
    }

    void refresh()
  }, [enabled, refresh])

  return { session, loading, error, refresh }
}
