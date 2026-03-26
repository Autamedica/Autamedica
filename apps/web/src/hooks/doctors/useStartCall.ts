/**
 * Hook: encapsulates call initiation logic (server-side validation → create call → navigate).
 * Extracted from StartCallButton.tsx to keep components free of business logic.
 */
import { useState, useCallback } from 'react'
import { logger } from '@autamedica/shared'
import { startCallBrowserService } from '@/lib/calls/services/start-call.browser'

interface UseStartCallOptions {
  doctorId: string
  patientId: string
  appointmentId?: string
}

export function useStartCall({ doctorId, patientId, appointmentId }: UseStartCallOptions) {
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startCall = useCallback(async () => {
    if (!doctorId.trim()) {
      setError('No encontramos tu perfil médico para iniciar la llamada')
      return
    }

    if (!patientId.trim()) {
      setError('Selecciona un paciente antes de iniciar la llamada')
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      const call = await startCallBrowserService.startCall({
        patientId,
        ...(appointmentId ? { appointmentId } : {}),
      })

      window.location.href = `/doctors/call/${call.roomId}?callId=${call.callId}`
    } catch (err) {
      logger.error('Failed to start call:', err)

      let errorMessage = 'Error al iniciar la llamada'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        errorMessage = JSON.stringify(err)
      }

      setError(errorMessage)
    } finally {
      setIsStarting(false)
    }
  }, [doctorId, patientId, appointmentId])

  return { startCall, isStarting, error }
}
