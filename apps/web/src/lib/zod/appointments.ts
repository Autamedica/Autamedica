import { z } from 'zod'

/** Matches DB CHECK constraint: consultation, follow_up, emergency, telemedicine, lab_test */
const AppointmentTypeEnum = z.enum(['consultation', 'follow_up', 'emergency', 'telemedicine', 'lab_test'])
/** Matches DB CHECK constraint: scheduled, confirmed, in_progress, completed, cancelled, no_show */
const AppointmentStatusEnum = z.enum(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'])

export const CreatePatientAppointmentSchema = z.object({
  start_time: z.string().min(1, 'start_time is required'),
  doctor_id: z.string().min(1, 'doctor_id is required'),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  type: AppointmentTypeEnum.optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(1000).optional(),
  meeting_url: z.string().url().optional(),
  location: z.string().max(500).optional(),
})

export const UpdatePatientAppointmentSchema = z.object({
  start_time: z.string().min(1).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  status: AppointmentStatusEnum.optional(),
  type: AppointmentTypeEnum.optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(1000).optional(),
  meeting_url: z.string().url().nullable().optional(),
  location: z.string().max(500).nullable().optional(),
})

const DoctorAppointmentTypeEnum = z.enum(['consultation', 'follow_up', 'emergency', 'telemedicine'])

export const CreateDoctorAppointmentSchema = z.object({
  patient_id: z.string().min(1, 'patient_id is required'),
  start_time: z.string().min(1, 'start_time is required'),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  type: DoctorAppointmentTypeEnum.default('consultation'),
  notes: z.string().max(2000).optional(),
  location: z.string().max(500).nullable().default(null),
})

export const TransitionAppointmentSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'in_progress', 're_queue', 'completed', 'cancelled', 'no_show'], {
    required_error: 'Missing status',
    invalid_type_error: 'Missing status',
  }),
})
