'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@autamedica/auth/client'
import { logger } from '@autamedica/shared'

interface DoctorStats {
  activeCount: number
  todayCount: number
  patientsCount: number
  historyCount: number
  nextAppointment: {
    time: string
    patientName: string
  } | null
}

interface UseDoctorStatsReturn {
  stats: DoctorStats | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useDoctorStats(doctorId?: string): UseDoctorStatsReturn {
  const [stats, setStats] = useState<DoctorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  useEffect(() => {
    supabaseRef.current = createBrowserClient()
  }, [])

  const fetchStats = useCallback(async () => {
    const supabase = supabaseRef.current
    if (!supabase || !doctorId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString()
      const nowIso = now.toISOString()

      // Parallel queries: appointments, patient count, medical records count
      const [apptResult, patientsResult, recordsResult] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, start_time, status, patient_id')
          .eq('doctor_id', doctorId)
          .gte('start_time', startOfDay)
          .order('start_time', { ascending: true }),
        supabase
          .from('appointments')
          .select('patient_id')
          .eq('doctor_id', doctorId)
          .not('patient_id', 'is', null),
        supabase
          .from('medical_records')
          .select('id', { count: 'exact', head: true })
          .eq('doctor_id', doctorId),
      ])

      if (apptResult.error) throw apptResult.error

      const appointments = apptResult.data || []

      // Unique patients from all appointments
      const uniquePatientIds = new Set(
        (patientsResult.data || []).map(r => r.patient_id).filter(Boolean)
      )

      const activeAppointments = appointments.filter(apt =>
        apt.status === 'scheduled' || apt.status === 'in_progress'
      )

      const todayAppointments = appointments.filter(apt =>
        apt.start_time >= startOfDay && apt.start_time <= endOfDay
      )

      const nextAppt = appointments.find(apt =>
        apt.start_time >= nowIso &&
        (apt.status === 'scheduled' || apt.status === 'confirmed')
      )

      let patientName = 'Paciente'
      if (nextAppt?.patient_id) {
        const { data: patient } = await supabase
          .from('patients')
          .select('user_id')
          .eq('id', nextAppt.patient_id)
          .single()

        if (patient?.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', patient.user_id)
            .single()

          if (profile) {
            patientName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Paciente'
          }
        }
      }

      setStats({
        activeCount: activeAppointments.length,
        todayCount: todayAppointments.length,
        patientsCount: uniquePatientIds.size,
        historyCount: recordsResult.count ?? 0,
        nextAppointment: nextAppt ? {
          time: new Date(nextAppt.start_time).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          patientName
        } : null
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error loading stats'
      setError(errorMessage)
      logger.error('Error in useDoctorStats:', err)
    } finally {
      setLoading(false)
    }
  }, [doctorId])

  useEffect(() => {
    if (!doctorId) return

    void fetchStats()

    const interval = setInterval(() => void fetchStats(), 60000)
    return () => clearInterval(interval)
  }, [doctorId, fetchStats])

  return {
    stats,
    loading,
    error,
    refresh: fetchStats
  }
}
