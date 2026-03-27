import type { AppointmentWithDoctor } from '@/lib/patients/types/appointment'
import { isTelemedicineCallWindowOpen } from '@/lib/calls/lib/telemedicine-window'

const JOINABLE_APPOINTMENT_STATUSES = new Set(['scheduled', 'confirmed', 'in_progress', 'in-progress'])

type TelemedicineLikeAppointment = Pick<
  AppointmentWithDoctor,
  'id' | 'type' | 'meeting_url' | 'status' | 'start_time' | 'scheduled_at' | 'end_time' | 'duration_minutes'
>

export function buildPatientTelemedicineEntryUrl(appointmentId: string): string {
  return `/patients/appointments?type=telemedicine&appointmentId=${encodeURIComponent(appointmentId)}`
}

export function isTelemedicineAppointment(appointment: Pick<AppointmentWithDoctor, 'type' | 'meeting_url'>): boolean {
  return appointment.type === 'telemedicine' || Boolean(appointment.meeting_url)
}

export function isJoinableTelemedicineAppointment(
  appointment: Pick<
    TelemedicineLikeAppointment,
    'type' | 'meeting_url' | 'status' | 'start_time' | 'scheduled_at' | 'end_time' | 'duration_minutes'
  >,
): boolean {
  return (
    isTelemedicineAppointment(appointment) &&
    JOINABLE_APPOINTMENT_STATUSES.has(appointment.status) &&
    isTelemedicineCallWindowOpen(appointment)
  )
}

export function getAppointmentStartIso(
  appointment: Pick<TelemedicineLikeAppointment, 'start_time' | 'scheduled_at'>,
): string {
  return appointment.start_time ?? appointment.scheduled_at
}
