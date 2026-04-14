'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CallSessionBootstrap } from '@autamedica/telemedicine'
import { logger } from '@autamedica/shared'
import { z } from 'zod'

interface UseGuestCallSessionResult {
  session: CallSessionBootstrap | null
  loading: boolean
  error: string | null
}

const CallSessionBootstrapSchema = z.object({
  callId: z.string().min(1),
  roomId: z.string().min(1),
  user: z.object({
    id: z.string().min(1),
    role: z.string().min(1),
  }).passthrough(),
  permissions: z.object({}).passthrough(),
  mediaPolicy: z.object({}).passthrough(),
  transport: z.object({}).passthrough(),
  waitingRoom: z.object({}).passthrough(),
}).passthrough()

function normalizeError(message: string): string {
  switch (message) {
    case 'call_ended':
      return 'Esta videollamada ya termino.'
    case 'call_canceled':
      return 'Esta videollamada fue cancelada.'
    case 'call_declined':
      return 'La videollamada fue rechazada.'
    case 'call_not_found':
      return 'No se encontro la videollamada. El enlace puede ser invalido.'
    case 'guest_calls_unavailable':
      return 'Las llamadas de invitado no estan disponibles en este momento.'
    default:
      return 'No se pudo conectar a la videollamada. Verifica que el enlace sea correcto.'
  }
}

export function useGuestCallSession(roomId: string, token: string | null): UseGuestCallSessionResult {
  const [session, setSession] = useState<CallSessionBootstrap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBootstrap = useCallback(async () => {
    if (!roomId || !token) {
      setError('Enlace invalido o expirado.')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/calls/${roomId}/bootstrap`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const parsed = CallSessionBootstrapSchema.safeParse(data)

      if (!parsed.success) {
        throw new Error('invalid_call_session')
      }

      setSession(data as CallSessionBootstrap)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      logger.error('[useGuestCallSession] bootstrap failed', err)
      setError(normalizeError(message))
    } finally {
      setLoading(false)
    }
  }, [roomId, token])

  useEffect(() => {
    void fetchBootstrap()
  }, [fetchBootstrap])

  return { session, loading, error }
}
