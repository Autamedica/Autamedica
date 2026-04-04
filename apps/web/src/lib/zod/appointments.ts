import { z } from 'zod'

const AppointmentTypeEnum = z.enum(['telemedicine', 'in_person', 'emergency', 'follow_up', 'consultation'])
const AppointmentStatusEnum = z.enum(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'])

export const CreatePatientAppointmentSchema = z.object({
  scheduled_at: z.string().min(1, 'scheduled_at is required'),
  doctor_id: z.string().min(1, 'doctor_id is required'),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  type: AppointmentTypeEnum.optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(1000).optional(),
  meeting_url: z.string().url().optional(),
  location: z.string().max(500).optional(),
})

export const UpdatePatientAppointmentSchema = z.object({
  scheduled_at: z.string().min(1).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  status: AppointmentStatusEnum.optional(),
  type: AppointmentTypeEnum.optional(),
  notes: z.string().max(2000).optional(),
  meeting_url: z.string().url().nullable().optional(),
  location: z.string().max(500).nullable().optional(),
})

const DoctorAppointmentTypeEnum = z.enum(['telemedicine', 'consultation', 'follow_up', 'emergency'])

export const CreateDoctorAppointmentSchema = z.object({
  patient_id: z.string().min(1, 'patient_id is required'),
  scheduled_at: z.string().min(1, 'scheduled_at is required'),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  type: DoctorAppointmentTypeEnum.default('consultation'),
  notes: z.string().max(2000).optional(),
  location: z.string().max(500).nullable().default(null),
})

export const TransitionAppointmentSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'in_progress', 're_queue', 'completed', 'cancelled'], {
    required_error: 'Missing status',
    invalid_type_error: 'Missing status',
  }),
})
