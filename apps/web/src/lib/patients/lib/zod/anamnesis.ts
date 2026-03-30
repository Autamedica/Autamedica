import { z } from 'zod'
import { KNOWN_SECTIONS } from '@/lib/patients/services/anamnesis.service'

// --- POST /api/patients/anamnesis ---
export const SaveSectionSchema = z.object({
  stepId: z.enum(KNOWN_SECTIONS),
  data: z.record(z.string(), z.unknown()).default({}),
  completed: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true'),
})

// --- PATCH /api/patients/anamnesis ---
const AnamnesisStatusEnum = z.enum(['in_progress', 'completed'])

export const UpdateMetaSchema = z
  .object({
    status: AnamnesisStatusEnum.optional(),
    privacy_accepted: z.boolean().optional(),
    terms_accepted: z.boolean().optional(),
    completion_percentage: z.number().int().min(0).max(100).optional(),
    completed_at: z.string().datetime().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field is required',
  })

// --- POST /api/patients/anamnesis/extract ---
export const ExtractInputSchema = z.object({
  checkpoint: z.enum(['partial', 'final']),
  clarificationTurns: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
        answeredAt: z.string().min(1),
      }),
    )
    .max(24)
    .default([]),
})
