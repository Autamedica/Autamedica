/**
 * Appointment utilities for API routes.
 * Ported from apps/patients/src/app/api/appointments/utils.ts
 */

import type { AppointmentStatus, AppointmentType, AppointmentWithDoctor } from '@/lib/patients/types/appointment'

export type DbAppointmentRow = {
  id: string
  patient_id: string
  doctor_id: string | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  type: string | null
  status: string | null
  notes: string | null
  reason: string | null
  meeting_url?: string | null
  location?: string | null
  created_at: string
  updated_at: string
  doctor?: {
    id: string
    specialty: string | null
    user_id?: string | null
    profile?: {
      first_name: string | null
      last_name: string | null
    } | null
  } | null
}

export function mapDbTypeToAppointmentType(dbType?: string | null): AppointmentType {
  switch (dbType) {
    case 'consultation':
    case 'follow_up':
    case 'emergency':
    case 'telemedicine':
    case 'lab_test':
      return dbType
    default:
      return 'consultation'
  }
}

export function mapTypeToDb(type?: AppointmentType | null): string {
  switch (type) {
    case 'consultation':
    case 'follow_up':
    case 'emergency':
    case 'telemedicine':
    case 'lab_test':
      return type
    default:
      return 'consultation'
  }
}

export function computeEndTime(startIso: string, durationMinutes: number): string {
  const start = new Date(startIso)
  const end = new Date(start.getTime() + durationMinutes * 60000)
  return end.toISOString()
}

function mapStatus(status?: string | null): AppointmentStatus {
  switch (status) {
    case 'scheduled':
    case 'confirmed':
    case 'in_progress':
    case 'completed':
    case 'cancelled':
    case 'no_show':
      return status
    default:
      return 'scheduled'
  }
}

export function mapAppointment(row: DbAppointmentRow): AppointmentWithDoctor {
  const startTime = row.start_time ? new Date(row.start_time).toISOString() : new Date().toISOString()
  const duration = row.duration_minutes ?? (row.end_time ? Math.max(5, Math.round((new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 60000)) : 30)

  return {
    id: row.id,
    patient_id: row.patient_id,
    doctor_id: row.doctor_id,
    start_time: startTime,
    end_time: row.end_time ?? null,
    duration_minutes: duration,
    status: mapStatus(row.status),
    type: mapDbTypeToAppointmentType(row.type),
    notes: row.notes ?? null,
    reason: row.reason ?? row.notes ?? null,
    meeting_url: row.meeting_url ?? null,
    location: row.location ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    doctor: row.doctor
      ? {
          id: row.doctor.id,
          first_name: row.doctor.profile?.first_name ?? null,
          last_name: row.doctor.profile?.last_name ?? null,
          specialty: row.doctor.specialty,
          profile_picture_url: null,
        }
      : null,
  }
}
