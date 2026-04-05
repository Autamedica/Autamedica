/**
 * Service: review submission business logic.
 * Validates review window, delegates DB ops to reviewsRepo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { reviewsRepo } from '../lib/repos/reviews.repo'

const REVIEW_WINDOW_DAYS = { min: 1, max: 30 }

function isValidRating(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

export interface ReviewInput {
  appointment_id: string
  overall_rating: number
  punctuality_rating?: number | null
  communication_rating?: number | null
  professionalism_rating?: number | null
  clinical_quality_rating?: number | null
  comment?: string | null
  is_anonymous?: boolean
}

export type ReviewValidationError =
  | { code: 'missing_appointment_id' }
  | { code: 'invalid_overall_rating' }
  | { code: 'invalid_sub_rating'; field: string }
  | { code: 'comment_too_long' }

export function validateReviewInput(input: ReviewInput): ReviewValidationError | null {
  if (!input.appointment_id || typeof input.appointment_id !== 'string') {
    return { code: 'missing_appointment_id' }
  }
  if (!isValidRating(input.overall_rating)) {
    return { code: 'invalid_overall_rating' }
  }
  for (const field of ['punctuality_rating', 'communication_rating', 'professionalism_rating', 'clinical_quality_rating'] as const) {
    const val = input[field]
    if (val !== undefined && val !== null && !isValidRating(val)) {
      return { code: 'invalid_sub_rating', field }
    }
  }
  if (input.comment && typeof input.comment === 'string' && input.comment.length > 1000) {
    return { code: 'comment_too_long' }
  }
  return null
}

export type SubmitReviewError =
  | 'appointment_not_found'
  | 'not_completed'
  | 'no_doctor'
  | 'outside_review_window'

export const reviewsService = {
  async submitReview(
    admin: SupabaseClient,
    userScopedClient: SupabaseClient,
    patientId: string,
    input: ReviewInput,
  ): Promise<{ id: string } | { error: SubmitReviewError; message: string }> {
    const appointment = await reviewsRepo.findAppointmentForReview(
      admin, input.appointment_id, patientId,
    )
    if (!appointment) {
      return { error: 'appointment_not_found', message: 'Appointment not found' }
    }
    if (appointment.status !== 'completed') {
      return { error: 'not_completed', message: 'Only completed appointments can be reviewed' }
    }
    if (!appointment.doctor_id) {
      return { error: 'no_doctor', message: 'Appointment has no assigned doctor' }
    }

    const daysSince = Math.floor(
      (Date.now() - new Date(appointment.start_time).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysSince < REVIEW_WINDOW_DAYS.min || daysSince > REVIEW_WINDOW_DAYS.max) {
      return {
        error: 'outside_review_window',
        message: `Reviews can only be submitted between ${REVIEW_WINDOW_DAYS.min} and ${REVIEW_WINDOW_DAYS.max} days after the appointment`,
      }
    }

    const result = await reviewsRepo.insertReview(userScopedClient, {
      appointment_id: input.appointment_id,
      patient_id: patientId,
      doctor_id: appointment.doctor_id,
      overall_rating: input.overall_rating,
      punctuality_rating: input.punctuality_rating ?? null,
      communication_rating: input.communication_rating ?? null,
      professionalism_rating: input.professionalism_rating ?? null,
      clinical_quality_rating: input.clinical_quality_rating ?? null,
      comment: input.comment?.trim() || null,
      is_anonymous: input.is_anonymous ?? false,
    })

    return result
  },
}
