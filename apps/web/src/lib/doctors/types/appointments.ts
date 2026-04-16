/**
 * Appointment types for the doctor portal.
 *
 * Canonical AppointmentType lives in @autamedica/types.
 * DoctorAppointmentType is a subset used in doctor-facing forms.
 */

import type { Appointment, PatientWithProfile, AppointmentType } from '@autamedica/types'

export type DoctorAppointmentType = Extract<AppointmentType, 'telemedicine' | 'consultation' | 'follow_up' | 'emergency'>

export interface DoctorAppointmentRecord extends Appointment {
  patient?: Pick<PatientWithProfile, 'id' | 'profile'> | null
}

export interface DoctorAppointmentFormValues {
  patientId: string
  guestName?: string
  date: string
  time: string
  durationMinutes: number
  type: DoctorAppointmentType
  notes: string
  location: string
}

export interface CreateDoctorAppointmentInput {
  patient_id: string
  guest_name?: string
  start_time: string
  duration_minutes: number
  type: DoctorAppointmentType
  notes?: string
  location?: string | null
}

export interface UpdateDoctorAppointmentInput {
  start_time?: string
  duration_minutes?: number
  type?: DoctorAppointmentType
  notes?: string | null
  location?: string | null
}
