/**
 * Hook: encapsulates call initiation logic (create call → signaling → navigate).
 * Extracted from StartCallButton.tsx to keep components free of business logic.
 */
import { useState, useCallback } from 'react'
import { createCallService, createSignalingClient } from '@autamedica/telemedicine'
import { createBrowserClient } from '@autamedica/auth'
import { logger } from '@autamedica/shared'

interface UseStartCallOptions {
  doctorId: string
  doctorName?: string
  patientId: string
  appointmentId?: string
}

export function useStartCall({ doctorId, doctorName, patientId, appointmentId }: UseStartCallOptions) {
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startCall = useCallback(async () => {
    if (!patientId.trim()) {
      setError('Selecciona un paciente antes de iniciar la llamada')
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      const callService = createCallService(createBrowserClient())
      const call = await callService.createCall(doctorId, patientId, appointmentId)

      const signaling = createSignalingClient(doctorId, 'doctor')
      await signaling.connect()

      await callService.updateCallStatus(call.id, 'ringing')
      signaling.sendToUser(patientId, {
        type: 'invite',
        callId: call.id,
        roomId: call.room_id,
        from: { doctorId, name: doctorName || 'Médico' },
        to: { patientId },
      })

      window.location.href = `/doctors/call/${call.room_id}?callId=${call.id}&waiting=true`
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
  }, [doctorId, doctorName, patientId, appointmentId])

  return { startCall, isStarting, error }
}
