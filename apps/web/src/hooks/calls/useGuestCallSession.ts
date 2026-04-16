'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CallSessionBootstrap } from '@autamedica/telemedicine'
import { logger } from '@autamedica/shared'
import { z } from 'zod'
import { fetchApi } from '@/lib/api-client'

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
    case 'invite_already_used':
      return 'Esta invitación ya fue utilizada.'
    case 'invite_expired':
      return 'Esta invitación ha expirado.'
    case 'invite_not_found':
      return 'La invitación no existe o es inválida.'
    default:
      return 'No se pudo conectar a la videollamada. Verifica que el enlace sea correcto.'
  }
}

export async function loadGuestCallBootstrap(roomId: string, token: string): Promise<CallSessionBootstrap> {
  const data = await fetchApi<CallSessionBootstrap>(`/api/calls/${encodeURIComponent(roomId)}/bootstrap`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const parsed = CallSessionBootstrapSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('invalid_call_session')
  }

  return parsed.data as unknown as CallSessionBootstrap
}

export function useGuestCallSession(roomId: string, initialToken: string | null, inviteId: string | null): UseGuestCallSessionResult {
  const [session, setSession] = useState<CallSessionBootstrap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBootstrap = useCallback(async () => {
    if (!roomId || (!initialToken && !inviteId)) {
      setError('Enlace inválido o expirado.')
      return
    }

    try {
      setLoading(true)
      setError(null)

      let token = initialToken

      // Flujo de Invitación Opaca (Redeem)
      if (!token && inviteId) {
        const cachedKey = `am_guest_token_${inviteId}`
        const cachedToken = sessionStorage.getItem(cachedKey)
        
        if (cachedToken) {
          token = cachedToken
        } else {
          // Canjear el inviteId por el Token Real WebRTC
          const resp = await fetchApi<{ token: string }>(`/api/calls/${encodeURIComponent(roomId)}/redeem-invite`, {
            method: 'POST',
            body: { invite: inviteId },
          })
          token = resp.token
          sessionStorage.setItem(cachedKey, token) // Guardamos para sobrevivir a refresh
        }
      }

      if (!token) throw new Error('invalid_call_session')

      const data = await loadGuestCallBootstrap(roomId, token)
      setSession(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : (err as { payload?: { error?: { code?: string } } })?.payload?.error?.code || 'unknown'
      logger.error('[useGuestCallSession] bootstrap/redeem failed', err)
      setError(normalizeError(message))
    } finally {
      setLoading(false)
    }
  }, [roomId, initialToken, inviteId])

  useEffect(() => {
    void fetchBootstrap()
  }, [fetchBootstrap])

  return { session, loading, error }
}
