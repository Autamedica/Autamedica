'use client'

import { useCallback, useState } from 'react'
import { logger } from '@autamedica/shared'
import type { CallStatus } from '@autamedica/telemedicine'
import { fetchApi } from '@/lib/api-client'

interface JoinTelemedicineAppointmentResponse {
  callId: string
  roomId: string
  status: CallStatus
  reused: boolean
}

interface UseJoinTelemedicineAppointmentResult {
  joinAppointment: (appointmentId: string) => Promise<boolean>
  joiningAppointmentId: string | null
  error: string | null
  clearError: () => void
}

export function useJoinTelemedicineAppointment(): UseJoinTelemedicineAppointmentResult {
  const [joiningAppointmentId, setJoiningAppointmentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const joinAppointment = useCallback(async (appointmentId: string): Promise<boolean> => {
    const trimmedAppointmentId = appointmentId.trim()
    if (!trimmedAppointmentId) {
      setError('appointment_id_required')
      return false
    }

    setJoiningAppointmentId(trimmedAppointmentId)
    setError(null)

    try {
      const response = await fetchApi<JoinTelemedicineAppointmentResponse>(
        `/api/patients/appointments/${trimmedAppointmentId}/join`,
        { method: 'POST' },
      )

      window.location.href = `/patients/call/${response.roomId}?callId=${response.callId}`
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos abrir la videollamada'
      logger.error('[useJoinTelemedicineAppointment] join failed', err)
      setError(message)
      return false
    } finally {
      setJoiningAppointmentId((current) =>
        current === trimmedAppointmentId ? null : current,
      )
    }
  }, [])

  return {
    joinAppointment,
    joiningAppointmentId,
    error,
    clearError,
  }
}
