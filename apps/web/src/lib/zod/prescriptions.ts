import { z } from 'zod'

const OptionalText = (max: number) => z.string().trim().max(max).optional()
const OptionalNullableText = (max: number) => z.string().trim().max(max).nullable().optional()

export const DoctorClinicalPrescriptionStatusSchema = z.enum([
  'activa',
  'completada',
  'cancelada',
  'pausada',
])

export const ExternalPrescriptionPatientSchema = z.object({
  name: z.string().trim().min(1, 'external_patient.name is required').max(200),
  dni: OptionalText(30),
  cuil: OptionalText(30),
  cpf: OptionalText(20),
  cns: OptionalText(30),
  address: OptionalText(300),
  email: OptionalText(200),
  phone: OptionalText(80),
  birth_date: z.string().optional(),
  gender: OptionalText(40),
}).refine((value) => Boolean(value.dni || value.cuil || value.cpf), {
  message: 'external_patient.dni, external_patient.cuil or external_patient.cpf is required',
})

export const BrazilPrescriptionModelSchema = z.enum([
  'simples',
  'controle_especial',
  'antimicrobiano',
  'notificacao_a',
  'notificacao_b',
])

const DoctorPrescriptionCreateBaseSchema = z.object({
  patient_id: z.string().trim().min(1, 'patient_id is required').optional(),
  external_patient: ExternalPrescriptionPatientSchema.optional(),
  country_code: z.enum(['AR', 'BR', 'UY', 'CL', 'MX']).default('AR').optional(),
  prescription_model_br: BrazilPrescriptionModelSchema.optional(),
  medication_name: z.string().trim().min(1, 'medication_name is required').max(200),
  principio_ativo: OptionalText(200),
  registro_anvisa: OptionalText(50),
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
  care_guide_tips: OptionalNullableText(4000),
  care_guide_forgotten: OptionalNullableText(4000),
  care_guide_warnings: OptionalNullableText(4000),
  care_guide_lifestyle: OptionalNullableText(4000),
})

export const DoctorPrescriptionCreateSchema = DoctorPrescriptionCreateBaseSchema
  .refine((value) => Boolean(value.patient_id || value.external_patient), {
    message: 'patient_id or external_patient is required',
  })

export const DoctorPrescriptionUpdateSchema = DoctorPrescriptionCreateBaseSchema
  .omit({ patient_id: true, external_patient: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  })
