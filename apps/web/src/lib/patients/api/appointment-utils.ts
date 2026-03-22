/**
 * Appointment utilities for API routes.
 * Ported from apps/patients/src/app/api/appointments/utils.ts
 */

import type { AppointmentStatus, AppointmentType, AppointmentWithDoctor } from '@/lib/patients/types/appointment'

export type DbAppointmentRow = {
  id: string
  patient_id: string
  doctor_id: string | null
  start_time: string
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
    case 'telemedicine':
    case 'follow_up':
    case 'emergency':
      return dbType as AppointmentType
    case 'consultation':
      return 'in_person'
    case 'in_person':
      return dbType as AppointmentType
    default:
      return 'in_person'
  }
}

export function mapTypeToDb(type?: AppointmentType | null): string {
  switch (type) {
    case 'telemedicine':
      return 'telemedicine'
    case 'follow_up':
      return 'follow_up'
    case 'emergency':
      return 'emergency'
    case 'consultation':
      return 'consultation'
    case 'in_person':
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
  const scheduledAt = row.start_time ? new Date(row.start_time).toISOString() : new Date().toISOString()
  const duration = row.duration_minutes ?? (row.end_time ? Math.max(5, Math.round((new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 60000)) : 30)

  return {
    id: row.id,
    patient_id: row.patient_id,
    doctor_id: row.doctor_id,
    scheduled_at: scheduledAt,
    duration_minutes: duration,
    status: mapStatus(row.status),
    type: mapDbTypeToAppointmentType(row.type),
    notes: row.notes ?? null,
    reason: row.reason ?? row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    diagnosis: undefined,
    treatment_plan: undefined,
    meeting_url: row.meeting_url ?? null,
    location: row.location ?? null,
    end_time: row.end_time ?? null,
    start_time: row.start_time ?? null,
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
