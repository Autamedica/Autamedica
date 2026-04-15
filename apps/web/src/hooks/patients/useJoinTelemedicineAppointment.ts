'use client'

import { useCallback, useState } from 'react'
import { logger } from '@autamedica/shared'
import type { CallStatus } from '@autamedica/telemedicine'
import { fetchApi, ApiError } from '@/lib/api-client'

const JOIN_ERROR_MESSAGES: Record<string, string> = {
  appointment_outside_call_window:
    'La ventana de conexión para este turno ya cerró. Solo podés unirte desde 45 minutos antes hasta 24 horas después de la hora programada.',
  appointment_not_joinable:
    'Este turno no está en un estado que permita unirse a la videollamada.',
  appointment_not_telemedicine:
    'Este turno no es de telemedicina.',
  appointment_doctor_missing:
    'Este turno no tiene un profesional asignado todavía.',
  appointment_not_found:
    'No encontramos el turno. Puede que haya sido cancelado.',
  appointment_id_required:
    'No se pudo identificar el turno.',
}

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

function toFriendlyMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const mapped = JOIN_ERROR_MESSAGES[err.message]
    if (mapped) return mapped
  }

  if (err instanceof Error) {
    const mapped = JOIN_ERROR_MESSAGES[err.message]
    if (mapped) return mapped
  }

  return 'No pudimos abrir la videollamada. Intentá de nuevo en unos segundos.'
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
      setError(JOIN_ERROR_MESSAGES.appointment_id_required)
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
      logger.error('[useJoinTelemedicineAppointment] join failed', err)
      setError(toFriendlyMessage(err))
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
