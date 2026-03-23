/**
 * Hook para manejar la sesión activa de consulta médica.
 * La sesión se inicia explícitamente cuando el doctor selecciona un paciente
 * o entra a una llamada de telemedicina.
 */

import type { UUID } from '@/types/medical'
import { logger } from '@autamedica/shared'
import { useCallback, useState } from 'react'

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

export function useActiveSession(): UseActiveSessionResult {
  const [session, setSession] = useState<ActiveSessionData | null>(null)
  const [loading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startSession = useCallback(async (patientId: UUID, sessionType: ActiveSessionData['sessionType']) => {
    try {
      setError(null)
      const sessionId = crypto.randomUUID() as UUID

      setSession({
        patientId,
        sessionId,
        sessionType,
        startTime: new Date().toISOString(),
        status: 'en_progreso'
      })

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
