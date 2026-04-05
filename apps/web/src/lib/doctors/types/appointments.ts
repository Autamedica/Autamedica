import type { Appointment, PatientWithProfile } from '@autamedica/types'

export type DoctorAppointmentType = 'telemedicine' | 'consultation' | 'follow_up' | 'emergency'

export interface DoctorAppointmentRecord extends Appointment {
  patient?: Pick<PatientWithProfile, 'id' | 'profile'> | null
}

export interface DoctorAppointmentFormValues {
  patientId: string
  date: string
  time: string
  durationMinutes: number
  type: DoctorAppointmentType
  notes: string
  location: string
}

export interface CreateDoctorAppointmentInput {
  patient_id: string
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
