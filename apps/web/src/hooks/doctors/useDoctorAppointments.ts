/**
 * Hook/controller for doctor agenda state.
 * Keeps React state local and delegates IO/business rules to services.
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { logger } from '@autamedica/shared'
import { doctorAppointmentsService } from '@/lib/doctors/services/doctor-appointments.service'
import { localDateTimeInputToIso } from '@/lib/appointments/time'
import type {
  DoctorAppointmentFormValues,
} from '@/lib/doctors/types/appointments'
import type { Appointment, AppointmentStatus } from '@autamedica/types'

interface UseDoctorAppointmentsResult {
  appointments: Appointment[]
  loading: boolean
  error: string | null
  isClientReady: boolean
  refetch: () => Promise<void>
  createAppointment: (values: DoctorAppointmentFormValues) => Promise<void>
  updateAppointment: (id: string, values: DoctorAppointmentFormValues) => Promise<void>
  transitionAppointment: (id: string, status: AppointmentStatus | 're_queue') => Promise<void>
}

export function useDoctorAppointments(): UseDoctorAppointmentsResult {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClientReady, setIsClientReady] = useState(false)

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await doctorAppointmentsService.list()
      setAppointments(data)
    } catch (err) {
      logger.error('[useDoctorAppointments] fetch failed', err)
      setError('No se pudo cargar la agenda médica.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setIsClientReady(true)
    void fetchAppointments()
  }, [fetchAppointments])

  const createAppointment = useCallback(
    async (values: DoctorAppointmentFormValues) => {
      try {
        const payload = {
          patient_id: values.patientId,
          guest_name: values.guestName,
          start_time: localDateTimeInputToIso(values.date, values.time),
          duration_minutes: values.durationMinutes,
          type: values.type,
          notes: values.notes,
          location: values.location,
        }
        await doctorAppointmentsService.create(payload)
        await fetchAppointments()
      } catch (err) {
        logger.error('[useDoctorAppointments] create failed', err)
        throw new Error('No se pudo agendar la cita.', { cause: err })
      }
    },
    [fetchAppointments],
  )

  const updateAppointment = useCallback(
    async (id: string, values: DoctorAppointmentFormValues) => {
      try {
        const payload = {
          start_time: localDateTimeInputToIso(values.date, values.time),
          duration_minutes: values.durationMinutes,
          type: values.type,
          notes: values.notes,
          location: values.location,
        }
        await doctorAppointmentsService.update(id, payload)
        await fetchAppointments()
      } catch (err) {
        logger.error('[useDoctorAppointments] update failed', err)
        throw new Error('No se pudo actualizar la cita.', { cause: err })
      }
    },
    [fetchAppointments],
  )

  const transitionAppointment = useCallback(
    async (id: string, status: AppointmentStatus | 're_queue') => {
      try {
        await doctorAppointmentsService.transition(id, status)
        await fetchAppointments()
      } catch (err) {
        // Preserve the original error as `cause` so Sentry shows the real root
        // cause (HTTP status, Postgres message, RLS denial, CHECK violation,
        // invalid transition, etc.) instead of the generic surface message.
        logger.error('[useDoctorAppointments] transition failed', { id, status, err })
        throw new Error('No se pudo cambiar el estado de la cita.', { cause: err })
      }
    },
    [fetchAppointments],
  )

  return useMemo(
    () => ({
      appointments,
      loading,
      error,
      isClientReady,
      refetch: fetchAppointments,
      createAppointment,
      updateAppointment,
      transitionAppointment,
    }),
    [appointments, loading, error, isClientReady, fetchAppointments, createAppointment, updateAppointment, transitionAppointment],
  )
}
