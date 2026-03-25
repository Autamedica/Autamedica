/**
 * DoctorStatsService — lógica de negocio para estadísticas del médico.
 *
 * Responsabilidades:
 * - Queries a Supabase (citas, pacientes, registros médicos).
 * - Transformación y derivación de datos (conteos, filtros por status).
 *
 * NO tiene estado React. No hace fetch. Es puramente funcional y testeable.
 * El hook `useDoctorStats` actúa como controller: gestiona estado y ciclo de vida.
 *
 * Capas: Hook (controller) → DoctorStatsService → getBrowserSupabaseClient → Supabase
 */
import { getBrowserSupabaseClient } from '../../supabase-browser'

export interface DoctorStats {
  activeCount: number
  todayCount: number
  patientsCount: number
  historyCount: number
  nextAppointment: {
    time: string
    patientName: string
  } | null
}

/**
 * Resuelve el nombre del paciente a partir de su ID.
 * Hace join patients → profiles para obtener first_name + last_name.
 */
async function resolvePatientName(patientId: string): Promise<string> {
  const supabase = getBrowserSupabaseClient()

  const { data: patient } = await supabase
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .single()

  if (!patient?.user_id) return 'Paciente'

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', patient.user_id)
    .single()

  if (!profile) return 'Paciente'

  return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Paciente'
}

/**
 * Obtiene las estadísticas del médico para el dashboard.
 * - Consultas activas y del día.
 * - Cantidad de pacientes únicos.
 * - Cantidad de registros médicos.
 * - Próxima cita con nombre de paciente resuelto.
 */
export async function getDoctorStats(doctorId: string): Promise<DoctorStats> {
  const supabase = getBrowserSupabaseClient()

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString()
  const nowIso = now.toISOString()

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

  const appointments = apptResult.data ?? []

  const uniquePatientIds = new Set(
    (patientsResult.data ?? []).map(r => r.patient_id).filter(Boolean)
  )

  const activeAppointments = appointments.filter(
    apt => apt.status === 'scheduled' || apt.status === 'in_progress'
  )

  const todayAppointments = appointments.filter(
    apt => apt.start_time >= startOfDay && apt.start_time <= endOfDay
  )

  const nextAppt = appointments.find(
    apt =>
      apt.start_time >= nowIso &&
      (apt.status === 'scheduled' || apt.status === 'confirmed')
  )

  const patientName = nextAppt?.patient_id
    ? await resolvePatientName(nextAppt.patient_id)
    : 'Paciente'

  return {
    activeCount: activeAppointments.length,
    todayCount: todayAppointments.length,
    patientsCount: uniquePatientIds.size,
    historyCount: recordsResult.count ?? 0,
    nextAppointment: nextAppt
      ? {
          time: new Date(nextAppt.start_time).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          patientName,
        }
      : null,
  }
}
