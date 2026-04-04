import { z } from 'zod'

const JsonValue: z.ZodType = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue)]),
)

export const UpdateReportSchema = z.object({
  recordId: z.string().min(1, 'missing_record_id'),
  report: z.record(z.string(), JsonValue),
  doctorNotes: z.string().max(10000).optional(),
})

export const GenerateReportSchema = z.object({
  doctorNotes: z.string().max(10000).optional(),
})

const TranscriptSegmentSchema = z.object({
  speaker: z.enum(['local', 'remote']),
  text: z.string(),
  timestamp: z.number(),
  isFinal: z.boolean(),
})

export const SaveTranscriptionSchema = z.object({
  segments: z.array(TranscriptSegmentSchema).min(1, 'invalid_segments'),
  fullText: z.string().default(''),
  durationSeconds: z.number().int().min(0).nullable().optional(),
  consentDoctor: z.boolean(),
  consentPatient: z.boolean().default(false),
  lang: z.string().max(10).default('es-AR'),
})
