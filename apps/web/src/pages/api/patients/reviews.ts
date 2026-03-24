import type { APIRoute } from 'astro'
import { createAdminClient, createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isValidRating(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

const REVIEW_WINDOW_DAYS = { min: 1, max: 30 }

export const GET: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) return json({ success: false, error: 'Unauthorized' }, 401)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('doctor_reviews')
      .select('appointment_id')
      .eq('patient_id', context.patientId)

    if (error) {
      logger.error('[reviews/GET] Query failed', error)
      return json({ success: false, error: 'Failed to fetch reviews' }, 500)
    }

    return json({
      success: true,
      data: (data ?? []).map((r: { appointment_id: string }) => r.appointment_id),
    })
  } catch (err) {
    logger.error('[reviews/GET] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) return json({ success: false, error: 'Unauthorized' }, 401)

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
      return json({ success: false, error: 'appointment_id is required' }, 400)
    }

    if (!isValidRating(overall_rating)) {
      return json({ success: false, error: 'overall_rating (1-5) is required' }, 400)
    }

    for (const [name, val] of Object.entries({
      punctuality_rating,
      communication_rating,
      professionalism_rating,
      clinical_quality_rating,
    })) {
      if (val !== undefined && val !== null && !isValidRating(val)) {
        return json({ success: false, error: `${name} must be 1-5` }, 400)
      }
    }

    if (comment && typeof comment === 'string' && comment.length > 1000) {
      return json({ success: false, error: 'Comment must be 1000 characters or less' }, 400)
    }

    const admin = createAdminClient()

    const { data: appointment, error: aptError } = await admin
      .from('appointments')
      .select('id, doctor_id, patient_id, status, start_time')
      .eq('id', appointment_id)
      .eq('patient_id', context.patientId)
      .single()

    if (aptError || !appointment) {
      return json({ success: false, error: 'Appointment not found' }, 404)
    }

    if (appointment.status !== 'completed') {
      return json({ success: false, error: 'Only completed appointments can be reviewed' }, 400)
    }

    if (!appointment.doctor_id) {
      return json({ success: false, error: 'Appointment has no assigned doctor' }, 400)
    }

    const daysSince = Math.floor(
      (Date.now() - new Date(appointment.start_time).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysSince < REVIEW_WINDOW_DAYS.min || daysSince > REVIEW_WINDOW_DAYS.max) {
      return json({
        success: false,
        error: `Reviews can only be submitted between ${REVIEW_WINDOW_DAYS.min} and ${REVIEW_WINDOW_DAYS.max} days after the appointment`,
      }, 400)
    }

    // Use user-scoped client so RLS enforces ownership
    const supabase = createServerClientFromRequest(request)

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
        return json({ success: false, error: 'Already reviewed this appointment' }, 409)
      }
      logger.error('[reviews/POST] Insert failed', insertError)
      return json({ success: false, error: 'Failed to submit review' }, 500)
    }

    return json({ success: true, data: { id: review.id } }, 201)
  } catch (err) {
    logger.error('[reviews/POST] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}
