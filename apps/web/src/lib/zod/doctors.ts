import { z } from 'zod'

const TimeSlotSchema = z.object({
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  slotDurationMinutes: z.number().int().min(5).max(120).optional(),
})

const DayScheduleSchema = z.object({
  isAvailable: z.boolean().optional(),
  timeSlots: z.array(TimeSlotSchema).max(10).optional(),
})

const WeeklyScheduleSchema = z.record(
  z.enum(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
  DayScheduleSchema,
).optional()

const JsonValue: z.ZodType = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue)]),
)

export const CreateDoctorProfileSchema = z.object({
  license_number: z.string().trim().min(1, 'license_number is required'),
  specialty: z.string().trim().min(1, 'specialty is required'),
  subspecialty: z.string().trim().nullable().optional(),
  years_experience: z.number().int().min(0).max(80).nullable().optional(),
  education: JsonValue.nullable().optional(),
  certifications: JsonValue.nullable().optional(),
  schedule: WeeklyScheduleSchema.nullable().optional(),
  consultation_fee: z.number().min(0).nullable().optional(),
  accepted_insurance: JsonValue.nullable().optional(),
  bio: z.string().trim().max(5000).nullable().optional(),
  languages: JsonValue.nullable().optional(),
  payout_cbu: z.string().trim().regex(/^\d{22}$/).nullable().optional(),
  payout_alias: z.string().trim().min(3).max(100).nullable().optional(),
  active: z.boolean().optional().default(true),
  fullName: z.string().trim().min(1).optional(),
  full_name: z.string().trim().min(1).optional(),
})

export const DoctorOnboardingCompleteSchema = z.object({
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().min(1).optional(),
})
