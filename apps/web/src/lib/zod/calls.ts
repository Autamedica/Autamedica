import { z } from 'zod'

export const RespondCallSchema = z.object({
  callId: z.string().trim().min(1, 'call_id_required'),
  action: z.enum(['accept', 'decline'], {
    required_error: 'invalid_call_action',
    invalid_type_error: 'invalid_call_action',
  }),
})

export const StartCallSchema = z.object({
  patientId: z.string().trim().min(1, 'patient_id_required'),
  appointmentId: z.string().trim().min(1).optional(),
})

export const CancelCallSchema = z.object({
  reason: z.enum(['doctor_canceled', 'no_answer_timeout']).optional(),
})

export const CallStatusSchema = z.object({
  status: z.enum(['connecting', 'connected', 'ended'], {
    required_error: 'invalid_call_status',
    invalid_type_error: 'invalid_call_status',
  }),
  reason: z.string().trim().max(500).optional(),
})
