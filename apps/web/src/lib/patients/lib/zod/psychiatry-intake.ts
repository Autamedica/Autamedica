import { z } from 'zod'
import { PSYCHIATRY_KNOWN_SECTIONS } from '@/lib/patients/services/psychiatry-intake.service'

const PsychiatrySectionEnum = z.enum(
  [...PSYCHIATRY_KNOWN_SECTIONS] as [typeof PSYCHIATRY_KNOWN_SECTIONS[number], ...typeof PSYCHIATRY_KNOWN_SECTIONS[number][]],
)

const SectionDataValue: z.ZodType = z.lazy(() =>
  z.union([
    z.string().max(5000),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(SectionDataValue).max(50),
    z.record(z.string(), SectionDataValue),
  ]),
)

export const SavePsychiatrySectionSchema = z.object({
  stepId: PsychiatrySectionEnum,
  phase: z.enum(['wizard_intake', 'conversational_symptoms', 'wizard_safety', 'conversational_closure']).optional(),
  data: z.record(z.string().max(100), SectionDataValue).default({}),
  completed: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => value === true || value === 'true'),
})

export const UpdatePsychiatryMetaSchema = z.object({
  status: z.enum(['in_progress', 'completed']).optional(),
  completion_percentage: z.number().int().min(0).max(100).optional(),
  completionPercentage: z.number().int().min(0).max(100).optional(),
  completed_at: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  privacy_accepted: z.boolean().optional(),
  privacyAccepted: z.boolean().optional(),
  terms_accepted: z.boolean().optional(),
  termsAccepted: z.boolean().optional(),
  last_phase: z.enum(['wizard_intake', 'conversational_symptoms', 'wizard_safety', 'conversational_closure', 'completed']).optional(),
  lastPhase: z.enum(['wizard_intake', 'conversational_symptoms', 'wizard_safety', 'conversational_closure', 'completed']).optional(),
  locked: z.boolean().optional(),
}).transform((obj) => ({
  ...(obj.status && { status: obj.status }),
  ...((obj.completionPercentage ?? obj.completion_percentage) != null && {
    completionPercentage: obj.completionPercentage ?? obj.completion_percentage,
  }),
  ...((obj.completedAt !== undefined || obj.completed_at !== undefined) && {
    completedAt: obj.completedAt ?? obj.completed_at ?? null,
  }),
  ...((obj.privacyAccepted ?? obj.privacy_accepted) != null && {
    privacyAccepted: obj.privacyAccepted ?? obj.privacy_accepted,
  }),
  ...((obj.termsAccepted ?? obj.terms_accepted) != null && {
    termsAccepted: obj.termsAccepted ?? obj.terms_accepted,
  }),
  ...((obj.lastPhase ?? obj.last_phase) != null && {
    lastPhase: obj.lastPhase ?? obj.last_phase,
  }),
  ...(typeof obj.locked === 'boolean' && { locked: obj.locked }),
})).refine((obj) => Object.keys(obj).length > 0, {
  message: 'At least one field is required',
})
