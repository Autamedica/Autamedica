/**
 * Hook: encapsulates call initiation logic (server-side validation → create call → navigate).
 * Extracted from StartCallButton.tsx to keep components free of business logic.
 */
import { useState, useCallback } from 'react'
import { logger } from '@autamedica/shared'
import { startCallBrowserService } from '@/lib/calls/services/start-call.browser'
import { translateCallError } from '@/lib/calls/lib/call-error-messages'

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

      const translated = translateCallError(
        err instanceof Error ? err.message : String(err),
      )
      setError(
        translated.title +
          (translated.description ? `: ${translated.description}` : ''),
      )
    } finally {
      setIsStarting(false)
    }
  }, [doctorId, patientId, appointmentId])

  return { startCall, isStarting, error }
}
