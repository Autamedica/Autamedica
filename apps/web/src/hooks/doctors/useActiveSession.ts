/**
 * Hook para manejar la sesión activa de consulta médica.
 * La sesión se inicia explícitamente cuando el doctor selecciona un paciente
 * o entra a una llamada de telemedicina.
 *
 * Persistida en sessionStorage para sobrevivir recargas de página (por tab).
 */

import type { UUID } from '@/types/medical'
import { logger } from '@autamedica/shared'
import { useCallback, useState } from 'react'

const STORAGE_KEY = 'autamedica:doctor:activeSession'

export interface ActiveSessionData {
  patientId: UUID | null
  sessionId: UUID | null
  sessionType: 'general' | 'seguimiento' | 'urgencia' | 'especialidad'
  startTime: string | null
  status: 'programada' | 'en_progreso' | 'completada' | 'cancelada'
}

export interface UseActiveSessionResult {
  session: ActiveSessionData | null
  loading: boolean
  error: string | null
  startSession: (patientId: UUID, sessionType: ActiveSessionData['sessionType']) => Promise<void>
  endSession: () => Promise<void>
}

function readStoredSession(): ActiveSessionData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ActiveSessionData) : null
  } catch {
    return null
  }
}

function writeStoredSession(data: ActiveSessionData | null): void {
  if (typeof window === 'undefined') return
  try {
    if (data) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

export function useActiveSession(): UseActiveSessionResult {
  const [session, setSession] = useState<ActiveSessionData | null>(readStoredSession)
  const [loading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startSession = useCallback(async (patientId: UUID, sessionType: ActiveSessionData['sessionType']) => {
    try {
      setError(null)
      const sessionId = crypto.randomUUID() as UUID

      const data: ActiveSessionData = {
        patientId,
        sessionId,
        sessionType,
        startTime: new Date().toISOString(),
        status: 'en_progreso'
      }

      setSession(data)
      writeStoredSession(data)

      logger.info('[useActiveSession] Sesión iniciada', { patientId, sessionType })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al iniciar sesión: ${errorMessage}`)
      throw err
    }
  }, [])

  const endSession = useCallback(async () => {
    if (!session) return

    try {
      setSession(null)
      writeStoredSession(null)
      logger.info('[useActiveSession] Sesión finalizada')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al finalizar sesión: ${errorMessage}`)
      throw err
    }
  }, [session])

  return {
    session,
    loading,
    error,
    startSession,
    endSession
  }
}
