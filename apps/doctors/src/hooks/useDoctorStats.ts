'use client'

import { createBrowserClient } from '@autamedica/auth/client'
import { logger } from '@autamedica/shared'
import { useEffect, useState } from 'react'

interface AppointmentStats {
  activeCount: number
  todayCount: number
  nextAppointment: {
    time: string
    patientName: string
  } | null
}

interface UseDoctorStatsReturn {
  stats: AppointmentStats | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/** Shape returned by the appointments select query */
interface AppointmentRow {
  id: string
  start_time: string
  status: string | null
  patient_id: string | null
}

/** Shape returned by the patients select query */
interface PatientRow {
  user_id: string | null
}

/** Shape returned by the profiles select query */
interface ProfileRow {
  first_name: string | null
  last_name: string | null
}

/**
 * Hook para obtener estadísticas de consultas del doctor autenticado
 *
 * - Consultas activas
 * - Consultas del día
 * - Próxima consulta
 */
export function useDoctorStats(doctorId?: string): UseDoctorStatsReturn {
  const [stats, setStats] = useState<AppointmentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const supabase = isClient ? createBrowserClient() : null

  const fetchStats = async () => {
    if (!supabase || !doctorId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Get today's date range
      const today = new Date()
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString()
      const now = new Date().toISOString()

      // Query appointments for this doctor
      const { data, error: apptError } = await supabase
        .from('appointments')
        .select('id, start_time, status, patient_id')
        .eq('doctor_id', doctorId)
        .gte('start_time', startOfDay)
        .order('start_time', { ascending: true })

      const appointments = data as unknown as AppointmentRow[] | null

      if (apptError) {
        throw apptError
      }

      // Calculate stats
      const activeAppointments = appointments?.filter(apt =>
        apt.status === 'scheduled' || apt.status === 'in_progress'
      ) || []

      const todayAppointments = appointments?.filter(apt =>
        apt.start_time >= startOfDay && apt.start_time <= endOfDay
      ) || []

      // Find next appointment
      const nextAppt = appointments?.find(apt =>
        apt.start_time >= now &&
        (apt.status === 'scheduled' || apt.status === 'confirmed')
      )

      // If we have a next appointment, try to fetch the patient name via profiles
      let patientName = 'Paciente'
      if (nextAppt?.patient_id) {
        const { data: rawPatient } = await supabase
          .from('patients')
          .select('user_id')
          .eq('id', nextAppt.patient_id)
          .single()
        const patientData = rawPatient as unknown as PatientRow | null

        if (patientData?.user_id) {
          const { data: rawProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', patientData.user_id)
            .single()
          const profileData = rawProfile as unknown as ProfileRow | null

          if (profileData) {
            patientName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Paciente'
          }
        }
      }

      const nextAppointment = nextAppt ? {
        time: new Date(nextAppt.start_time).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        patientName
      } : null

      setStats({
        activeCount: activeAppointments.length,
        todayCount: todayAppointments.length,
        nextAppointment
      })

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error loading stats'
      setError(errorMessage)
      logger.error('Error in useDoctorStats:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!supabase || !doctorId) return

    fetchStats()

    // Refresh stats every 60 seconds
    const interval = setInterval(fetchStats, 60000)

    return () => clearInterval(interval)
  }, [supabase, doctorId])

  return {
    stats,
    loading,
    error,
    refresh: fetchStats
  }
}
