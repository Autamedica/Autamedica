import type { Appointment } from '@autamedica/types'
import { isTelemedicineCallWindowOpen } from '@/lib/calls/lib/telemedicine-window'

export type DoctorAppointmentBoardView = {
  sortedAppointments: Appointment[]
  todayCount: number
  telemedicineCount: number
  pendingCount: number
  confirmedCount: number
}

export type DoctorPatientAppointmentInsight = {
  upcomingAppointmentsCount: number
  nextAppointmentByPatient: Map<string, {
    id: string
    start_time: string
    type: string | null
  }>
  completedByPatient: Map<string, number>
}

export type DoctorDailyAgendaView = {
  todayAppointments: Appointment[]
  upcomingToday: Appointment[]
  weekCount: number
}

const CALLABLE_APPOINTMENT_STATUSES = new Set(['confirmed', 'in_progress'])

function isSameLocalDay(iso: string, referenceDate: Date): boolean {
  if (!iso) return false
  const value = new Date(iso)
  return (
    value.getFullYear() === referenceDate.getFullYear() &&
    value.getMonth() === referenceDate.getMonth() &&
    value.getDate() === referenceDate.getDate()
  )
}

function safeTimestamp(iso: string | null | undefined): number {
  if (!iso) return 0
  const value = Date.parse(iso)
  return Number.isNaN(value) ? 0 : value
}

function canStartTelemedicineCall(appointment: Appointment): boolean {
  return (
    appointment.type === 'telemedicine' &&
    CALLABLE_APPOINTMENT_STATUSES.has(appointment.status ?? 'scheduled') &&
    isTelemedicineCallWindowOpen(appointment)
  )
}

function sortAgendaAppointments(left: Appointment, right: Appointment, now: number): number {
  const leftCallable = canStartTelemedicineCall(left)
  const rightCallable = canStartTelemedicineCall(right)

  // Prioritize active telemedicine calls
  if (leftCallable !== rightCallable) return leftCallable ? -1 : 1

  const leftStart = safeTimestamp(left.start_time)
  const rightStart = safeTimestamp(right.start_time)
  const leftIsFuture = leftStart >= now
  const rightIsFuture = rightStart >= now

  // Prioritize future appointments over past ones
  if (leftIsFuture !== rightIsFuture) return leftIsFuture ? -1 : 1

  // If both are future, ascending order. If both are past, descending order.
  return leftIsFuture ? leftStart - rightStart : rightStart - leftStart
}

export function selectDoctorAppointmentBoardView(
  appointments: Appointment[],
  referenceTime: number = Date.now(),
): DoctorAppointmentBoardView {
  const sortedAppointments = [...appointments].sort((a, b) => sortAgendaAppointments(a, b, referenceTime))
  const referenceDay = new Date(referenceTime)

  // Use a single pass (O(N)) to calculate all metrics instead of multiple array filters (O(N*4))
  const metrics = sortedAppointments.reduce(
    (acc, apt) => {
      if (isSameLocalDay(apt.start_time, referenceDay)) acc.todayCount++
      if (apt.type === 'telemedicine') acc.telemedicineCount++
      if (apt.status === 'scheduled') acc.pendingCount++
      if (apt.status === 'confirmed') acc.confirmedCount++
      return acc
    },
    { todayCount: 0, telemedicineCount: 0, pendingCount: 0, confirmedCount: 0 }
  )

  return {
    sortedAppointments,
    ...metrics,
  }
}

export function selectDoctorDailyAgendaView(
  appointments: Appointment[],
  referenceDate: Date = new Date(),
): DoctorDailyAgendaView {
  const nowMs = referenceDate.getTime()
  const startOfWeek = new Date(referenceDate)
  startOfWeek.setDate(referenceDate.getDate() - referenceDate.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  let weekCount = 0
  const todayAppointments: Appointment[] = []

  // Single pass to collect today's appointments and week's count
  for (const appointment of appointments) {
    if (appointment.status === 'cancelled') continue

    const startMs = safeTimestamp(appointment.start_time)
    
    if (startMs >= startOfWeek.getTime() && startMs < endOfWeek.getTime()) {
      weekCount++
    }

    if (isSameLocalDay(appointment.start_time, referenceDate)) {
      todayAppointments.push(appointment)
    }
  }

  // Sort today's appointments
  todayAppointments.sort((a, b) => safeTimestamp(a.start_time) - safeTimestamp(b.start_time))

  // Find next 3 appointments starting from up to 2 hours ago
  const upcomingToday = todayAppointments
    .filter((apt) => safeTimestamp(apt.start_time) >= nowMs - 2 * 60 * 60 * 1000)
    .slice(0, 3)

  return {
    todayAppointments,
    upcomingToday,
    weekCount,
  }
}

export function selectDoctorPatientAppointmentInsights(
  appointments: Appointment[],
  referenceTime: number = Date.now(),
): DoctorPatientAppointmentInsight {
  const nextAppointmentByPatient = new Map<string, { id: string; start_time: string; type: string | null }>()
  const completedByPatient = new Map<string, number>()
  
  let upcomingAppointmentsCount = 0

  // Sort first to ensure we pick the earliest upcoming appointment per patient
  const sortedAppointments = [...appointments].sort(
    (a, b) => safeTimestamp(a.start_time) - safeTimestamp(b.start_time)
  )

  for (const appointment of sortedAppointments) {
    const { status, patient_id, start_time, type, id } = appointment
    if (!patient_id) continue

    if (status === 'completed') {
      const currentCount = completedByPatient.get(patient_id) ?? 0
      completedByPatient.set(patient_id, currentCount + 1)
      continue
    }

    if ((status === 'scheduled' || status === 'confirmed') && safeTimestamp(start_time) > referenceTime) {
      upcomingAppointmentsCount++
      // Since it's sorted, the first one we see is the "next" one
      if (!nextAppointmentByPatient.has(patient_id)) {
        nextAppointmentByPatient.set(patient_id, { id, start_time, type })
      }
    }
  }

  return {
    upcomingAppointmentsCount,
    nextAppointmentByPatient,
    completedByPatient,
  }
}
