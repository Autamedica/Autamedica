/**
 * Hook/controller for doctor agenda state.
 * Keeps React state local and delegates IO/business rules to services.
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { logger } from '@autamedica/shared'
import { doctorAppointmentsService } from '@/lib/doctors/services/doctor-appointments.service'
import type {
  DoctorAppointmentFormValues,
  DoctorAppointmentRecord,
} from '@/lib/doctors/types/appointments'
import type { AppointmentStatus } from '@autamedica/types'

interface UseDoctorAppointmentsResult {
  appointments: DoctorAppointmentRecord[]
  loading: boolean
  error: string | null
  isClientReady: boolean
  refetch: () => Promise<void>
  createAppointment: (values: DoctorAppointmentFormValues) => Promise<DoctorAppointmentRecord>
  updateAppointment: (id: string, values: DoctorAppointmentFormValues) => Promise<DoctorAppointmentRecord>
  transitionAppointment: (id: string, status: AppointmentStatus | 're_queue') => Promise<DoctorAppointmentRecord>
}

export function useDoctorAppointments(): UseDoctorAppointmentsResult {
  const [appointments, setAppointments] = useState<DoctorAppointmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClientReady, setIsClientReady] = useState(false)

  useEffect(() => {
    setIsClientReady(true)
  }, [])

  const refetch = useCallback(async (): Promise<void> => {
    if (!isClientReady) return

    try {
      setLoading(true)
      setError(null)
      const data = await doctorAppointmentsService.list()
      setAppointments(data)
    } catch (err) {
      logger.error('[useDoctorAppointments] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar citas')
    } finally {
      setLoading(false)
    }
  }, [isClientReady])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const createAppointment = useCallback(
    async (values: DoctorAppointmentFormValues): Promise<DoctorAppointmentRecord> => {
      const created = await doctorAppointmentsService.create(values)
      setAppointments((prev) =>
        [...prev, created].sort(
          (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
        ),
      )
      return created
    },
    [],
  )

  const updateAppointment = useCallback(
    async (id: string, values: DoctorAppointmentFormValues): Promise<DoctorAppointmentRecord> => {
      const updated = await doctorAppointmentsService.update(id, values)
      setAppointments((prev) =>
        prev
          .map((appt) => (appt.id === id ? { ...appt, ...updated } : appt))
          .sort(
            (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
          ),
      )
      return updated
    },
    [],
  )

  const transitionAppointment = useCallback(
    async (id: string, status: AppointmentStatus | 're_queue'): Promise<DoctorAppointmentRecord> => {
      const updated = await doctorAppointmentsService.transition(id, status)
      setAppointments((prev) =>
        prev
          .map((appt) => (appt.id === id ? { ...appt, ...updated } : appt))
          .sort(
            (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
          ),
      )
      return updated
    },
    [],
  )

  return useMemo(
    () => ({
      appointments,
      loading,
      error,
      isClientReady,
      refetch,
      createAppointment,
      updateAppointment,
      transitionAppointment,
    }),
    [appointments, loading, error, isClientReady, refetch, createAppointment, updateAppointment, transitionAppointment],
  )
}
