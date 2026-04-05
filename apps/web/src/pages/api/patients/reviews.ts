import type { APIRoute } from 'astro'
import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { jsonOk, jsonFail, unauthorized, badRequest, notFound, internalError } from '@/lib/api-helpers'
import { reviewsRepo } from '@/lib/patients/lib/repos/reviews.repo'
import { reviewsService, validateReviewInput, type ReviewInput } from '@/lib/patients/services/reviews.service'

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const context = await resolvePatientContext(request, locals)
    if (!context) return unauthorized()

    const ids = await reviewsRepo.listReviewedAppointmentIds(createAstroAdminClient(), context.patientId)
    return jsonOk(ids)
  } catch (err) {
    logger.error('[reviews/GET] Unexpected error', err)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const context = await resolvePatientContext(request, locals)
    if (!context) return unauthorized()

    const body = await request.json() as ReviewInput
    const validationError = validateReviewInput(body)
    if (validationError) {
      const msg = validationError.code === 'invalid_sub_rating'
        ? `${validationError.field} must be 1-5`
        : validationError.code === 'missing_appointment_id'
          ? 'appointment_id is required'
          : validationError.code === 'invalid_overall_rating'
            ? 'overall_rating (1-5) is required'
            : 'Comment must be 1000 characters or less'
      return badRequest(msg)
    }

    const admin = createAstroAdminClient()
    const userClient = createAstroServerClientFromRequest(request)
    const result = await reviewsService.submitReview(admin, userClient, context.patientId, body)

    if ('error' in result) {
      if (result.error === 'appointment_not_found') return notFound(result.message)
      return badRequest(result.message)
    }

    return jsonOk(result, 201)
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return jsonFail('CONFLICT', 'Already reviewed this appointment', 409)
    }
    logger.error('[reviews/POST] Unexpected error', err)
    return internalError('Failed to submit review')
  }
}
