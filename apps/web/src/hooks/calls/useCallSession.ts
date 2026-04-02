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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidCallSessionBootstrap(value: unknown): value is CallSessionBootstrap {
  if (!value || typeof value !== 'object') {
    return false
  }

  const session = value as CallSessionBootstrap

  return (
    isNonEmptyString(session.callId)
    && isNonEmptyString(session.roomId)
    && Boolean(session.user)
    && isNonEmptyString(session.user.id)
    && isNonEmptyString(session.user.role)
    && Boolean(session.permissions)
    && Boolean(session.mediaPolicy)
    && Boolean(session.transport)
    && Boolean(session.waitingRoom)
  )
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
    case 'invalid_call_session':
      return 'La videollamada llegó con datos incompletos. Reintentá para reconstruir la sesión.'
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

      if (!isValidCallSessionBootstrap(data)) {
        throw new Error('invalid_call_session')
      }

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
