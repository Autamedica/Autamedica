import type { APIRoute } from 'astro'
import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { jsonOk, jsonFail, unauthorized, badRequest, notFound, internalError } from '@/lib/api-helpers'

function isValidRating(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

const REVIEW_WINDOW_DAYS = { min: 1, max: 30 }

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const context = await resolvePatientContext(request, locals)
    if (!context) return unauthorized()

    const admin = createAstroAdminClient()
    const { data, error } = await admin
      .from('doctor_reviews')
      .select('appointment_id')
      .eq('patient_id', context.patientId)

    if (error) {
      logger.error('[reviews/GET] Query failed', error)
      return internalError('Failed to fetch reviews')
    }

    return jsonOk((data ?? []).map((r: { appointment_id: string }) => r.appointment_id))
  } catch (err) {
    logger.error('[reviews/GET] Unexpected error', err)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const context = await resolvePatientContext(request, locals)
    if (!context) return unauthorized()

    const body = await request.json()
    const {
      appointment_id,
      overall_rating,
      punctuality_rating,
      communication_rating,
      professionalism_rating,
      clinical_quality_rating,
      comment,
      is_anonymous = false,
    } = body as {
      appointment_id?: string
      overall_rating?: number
      punctuality_rating?: number
      communication_rating?: number
      professionalism_rating?: number
      clinical_quality_rating?: number
      comment?: string
      is_anonymous?: boolean
    }

    if (!appointment_id || typeof appointment_id !== 'string') {
      return badRequest('appointment_id is required')
    }

    if (!isValidRating(overall_rating)) {
      return badRequest('overall_rating (1-5) is required')
    }

    for (const [name, val] of Object.entries({
      punctuality_rating,
      communication_rating,
      professionalism_rating,
      clinical_quality_rating,
    })) {
      if (val !== undefined && val !== null && !isValidRating(val)) {
        return badRequest(`${name} must be 1-5`)
      }
    }

    if (comment && typeof comment === 'string' && comment.length > 1000) {
      return badRequest('Comment must be 1000 characters or less')
    }

    const admin = createAstroAdminClient()

    const { data: appointment, error: aptError } = await admin
      .from('appointments')
      .select('id, doctor_id, patient_id, status, start_time')
      .eq('id', appointment_id)
      .eq('patient_id', context.patientId)
      .single()

    if (aptError || !appointment) {
      return notFound('Appointment not found')
    }

    if (appointment.status !== 'completed') {
      return badRequest('Only completed appointments can be reviewed')
    }

    if (!appointment.doctor_id) {
      return badRequest('Appointment has no assigned doctor')
    }

    const daysSince = Math.floor(
      (Date.now() - new Date(appointment.start_time).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysSince < REVIEW_WINDOW_DAYS.min || daysSince > REVIEW_WINDOW_DAYS.max) {
      return badRequest(
        `Reviews can only be submitted between ${REVIEW_WINDOW_DAYS.min} and ${REVIEW_WINDOW_DAYS.max} days after the appointment`,
      )
    }

    // Use user-scoped client so RLS enforces ownership
    const supabase = createAstroServerClientFromRequest(request)

    const { data: review, error: insertError } = await supabase
      .from('doctor_reviews')
      .insert({
        appointment_id,
        patient_id: context.patientId,
        doctor_id: appointment.doctor_id,
        overall_rating,
        punctuality_rating: punctuality_rating ?? null,
        communication_rating: communication_rating ?? null,
        professionalism_rating: professionalism_rating ?? null,
        clinical_quality_rating: clinical_quality_rating ?? null,
        comment: comment?.trim() || null,
        is_anonymous,
      } as never)
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return jsonFail('CONFLICT', 'Already reviewed this appointment', 409)
      }
      logger.error('[reviews/POST] Insert failed', insertError)
      return internalError('Failed to submit review')
    }

    return jsonOk({ id: review.id }, 201)
  } catch (err) {
    logger.error('[reviews/POST] Unexpected error', err)
    return internalError()
  }
}
