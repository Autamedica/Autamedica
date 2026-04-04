import { z } from 'zod'

const ChatHistoryEntrySchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

export const AnamnesisChatSchema = z.object({
  message: z.string().trim().min(1, 'message_required'),
  checkpoint: z.enum(['partial', 'final'], {
    required_error: 'checkpoint_required',
    invalid_type_error: 'checkpoint_required',
  }),
  history: z.array(ChatHistoryEntrySchema).max(100).default([]),
  guidanceQuestions: z.array(z.string()).max(20).default([]),
  coverageGaps: z.array(z.string()).max(20).default([]),
  coverageSummary: z.string().optional(),
})

export const AiQuestionSchema = z.object({
  chiefComplaint: z.string().trim().min(5, 'chief_complaint_too_short').max(2000, 'chief_complaint_too_long'),
  existingSections: z.array(z.string()).max(30).optional(),
})

export const EnsurePatientProfileSchema = z.object({
  email: z.string().email().nullable().optional(),
})

export const WebhookOpenClawSchema = z.object({
  from: z.string().min(1, 'Missing from or message'),
  message: z.string().min(1, 'Missing from or message'),
  channel: z.string().optional(),
  timestamp: z.string().optional(),
})
