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

const CALLABLE_APPOINTMENT_STATUSES = new Set(['scheduled', 'confirmed', 'in_progress', 'in-progress'])

function isSameLocalDay(iso: string, reference: Date): boolean {
  const value = new Date(iso)
  return (
    value.getFullYear() === reference.getFullYear()
    && value.getMonth() === reference.getMonth()
    && value.getDate() === reference.getDate()
  )
}

function safeTimestamp(iso: string | null | undefined): number {
  if (!iso) return 0
  const value = Date.parse(iso)
  return Number.isNaN(value) ? 0 : value
}

function canStartTelemedicineCall(appointment: Appointment): boolean {
  return (
    appointment.type === 'telemedicine'
    && CALLABLE_APPOINTMENT_STATUSES.has(appointment.status ?? 'scheduled')
    && isTelemedicineCallWindowOpen(appointment)
  )
}

function sortAgendaAppointments(left: Appointment, right: Appointment, now: number): number {
  const leftCallable = canStartTelemedicineCall(left)
  const rightCallable = canStartTelemedicineCall(right)

  if (leftCallable !== rightCallable) {
    return leftCallable ? -1 : 1
  }

  const leftStart = safeTimestamp(left.start_time)
  const rightStart = safeTimestamp(right.start_time)
  const leftIsFuture = leftStart >= now
  const rightIsFuture = rightStart >= now

  if (leftIsFuture !== rightIsFuture) {
    return leftIsFuture ? -1 : 1
  }

  return leftIsFuture ? leftStart - rightStart : rightStart - leftStart
}

export function selectDoctorAppointmentBoardView(
  appointments: Appointment[],
  referenceTime: number = Date.now(),
): DoctorAppointmentBoardView {
  const sortedAppointments = [...appointments].sort((left, right) => sortAgendaAppointments(left, right, referenceTime))
  const referenceDay = new Date(referenceTime)

  return {
    sortedAppointments,
    todayCount: sortedAppointments.filter((apt) => isSameLocalDay(apt.start_time, referenceDay)).length,
    telemedicineCount: sortedAppointments.filter((apt) => apt.type === 'telemedicine').length,
    pendingCount: sortedAppointments.filter((apt) => apt.status === 'scheduled').length,
    confirmedCount: sortedAppointments.filter((apt) => apt.status === 'confirmed').length,
  }
}

export function selectDoctorDailyAgendaView(
  appointments: Appointment[],
  referenceDate: Date = new Date(),
): DoctorDailyAgendaView {
  const todayAppointments = appointments
    .filter((appointment) => isSameLocalDay(appointment.start_time, referenceDate) && appointment.status !== 'cancelled')
    .sort((left, right) => safeTimestamp(left.start_time) - safeTimestamp(right.start_time))

  const nowMs = referenceDate.getTime()
  const upcomingToday = todayAppointments
    .filter((appointment) => safeTimestamp(appointment.start_time) >= nowMs - 2 * 60 * 60 * 1000)
    .slice(0, 3)

  const startOfWeek = new Date(referenceDate)
  startOfWeek.setDate(referenceDate.getDate() - referenceDate.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  const weekCount = appointments.filter((appointment) => {
    const start = safeTimestamp(appointment.start_time)
    return start >= startOfWeek.getTime() && start < endOfWeek.getTime() && appointment.status !== 'cancelled'
  }).length

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
  const nextAppointmentByPatient = new Map<string, {
    id: string
    start_time: string
    type: string | null
  }>()
  const completedByPatient = new Map<string, number>()

  const futureAppointments = appointments
    .filter((appointment) => {
      const startsAt = safeTimestamp(appointment.start_time)
      return (
        (appointment.status === 'scheduled' || appointment.status === 'confirmed')
        && startsAt > referenceTime
      )
    })
    .sort((left, right) => safeTimestamp(left.start_time) - safeTimestamp(right.start_time))

  for (const appointment of futureAppointments) {
    if (appointment.patient_id && !nextAppointmentByPatient.has(appointment.patient_id)) {
      nextAppointmentByPatient.set(appointment.patient_id, {
        id: appointment.id,
        start_time: appointment.start_time,
        type: appointment.type,
      })
    }
  }

  for (const appointment of appointments) {
    if (appointment.status === 'completed' && appointment.patient_id) {
      completedByPatient.set(
        appointment.patient_id,
        (completedByPatient.get(appointment.patient_id) ?? 0) + 1,
      )
    }
  }

  return {
    upcomingAppointmentsCount: futureAppointments.length,
    nextAppointmentByPatient,
    completedByPatient,
  }
}
