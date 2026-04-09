import { z } from 'zod'

const OptionalText = (max: number) => z.string().trim().max(max).optional()
const OptionalNullableText = (max: number) => z.string().trim().max(max).nullable().optional()

export const DoctorClinicalPrescriptionStatusSchema = z.enum([
  'activa',
  'completada',
  'cancelada',
  'pausada',
])

export const DoctorPrescriptionCreateSchema = z.object({
  patient_id: z.string().trim().min(1, 'patient_id is required'),
  medication_name: z.string().trim().min(1, 'medication_name is required').max(200),
  dosage: OptionalText(200),
  frequency: OptionalText(200),
  duration: OptionalText(200),
  instructions: OptionalText(4000),
  status: DoctorClinicalPrescriptionStatusSchema.optional(),
  prescribed_date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().nullable().optional(),
  notes: OptionalNullableText(2000),
  side_effects_warning: OptionalNullableText(2000),
  diagnosis: OptionalNullableText(500),
})

export const DoctorPrescriptionUpdateSchema = DoctorPrescriptionCreateSchema
  .omit({ patient_id: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  })
