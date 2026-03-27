/**
 * CQRS Read Model: Doctor Dashboard Statistics
 *
 * Query optimizada para el dashboard del doctor.
 * Agrega datos de múltiples tablas en paralelo.
 * Separada del service de negocio — es solo lectura.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'

export interface DashboardStatsView {
  activeAppointments: number
  todayAppointments: number
  totalPatients: number
  medicalRecords: number
  nextAppointment: {
    time: string
    patientName: string
  } | null
}

export async function queryDashboardStats(
  supabase: SupabaseClient,
  doctorId: string
): Promise<DashboardStatsView> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const [apptResult, patientsResult, recordsResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, start_time, status, patient_id')
      .eq('doctor_id', doctorId)
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .not('status', 'eq', 'cancelled'),

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

  const todayAppts = apptResult.data ?? []
  const uniquePatients = new Set(
    (patientsResult.data ?? []).map((r) => r.patient_id)
  )

  let nextAppointment: DashboardStatsView['nextAppointment'] = null
  const now = new Date().toISOString()
  const upcoming = todayAppts
    .filter((a) => a.start_time > now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  if (upcoming.length > 0) {
    const next = upcoming[0]
    let patientName = 'Paciente'

    if (next.patient_id) {
      const { data: patient } = await supabase
        .from('patients')
        .select('user_id')
        .eq('id', next.patient_id)
        .single()

      if (patient?.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', patient.user_id)
          .single()

        if (profile) {
          patientName = [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(' ') || 'Paciente'
        }
      }
    }

    nextAppointment = {
      time: next.start_time,
      patientName,
    }
  }

  logger.info(`[query:dashboard-stats] doctor=${doctorId} today=${todayAppts.length} patients=${uniquePatients.size}`)

  return {
    activeAppointments: todayAppts.filter((a) => a.status === 'in-progress').length,
    todayAppointments: todayAppts.length,
    totalPatients: uniquePatients.size,
    medicalRecords: recordsResult.count ?? 0,
    nextAppointment,
  }
}
