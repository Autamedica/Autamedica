import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import {
  DoctorNotFoundError,
  queryDoctorSlots,
} from '@/lib/doctors/queries/doctor-slots.query'
import { jsonOk, badRequest, notFound, internalError, unauthorized, forbidden } from '@/lib/api-helpers'

import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { assertCountryPair } from '@/lib/patients/care-country'
import { createAstroAdminClient } from '@/lib/supabase'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 30

export const GET: APIRoute = async ({ request, params, locals }) => {
  try {
    const context = await resolvePatientContext(request, locals)
    if (!context) return unauthorized()

    const doctorId = params.id
    if (!doctorId) return badRequest('Missing doctor id')

    await assertCountryPair(createAstroAdminClient(locals.runtime?.env), context.patientId, doctorId)

    const url = new URL(request.url)
    const dateFrom = url.searchParams.get('from')
    const dateTo = url.searchParams.get('to')

    if (!dateFrom || !dateTo) {
      return badRequest('Both "from" and "to" query parameters are required')
    }
    if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
      return badRequest('Dates must be in YYYY-MM-DD format')
    }

    const daysDiff = Math.ceil(
      (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysDiff < 0) return badRequest('"from" must be before "to"')
    if (daysDiff > MAX_RANGE_DAYS) {
      return badRequest(`Date range must not exceed ${MAX_RANGE_DAYS} days`)
    }

    const slots = await queryDoctorSlots(createAstroAdminClient(locals.runtime?.env), doctorId, { dateFrom, dateTo })

    return jsonOk({
      doctor_id: doctorId,
      date_from: dateFrom,
      date_to: dateTo,
      slots,
      total: slots.length,
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'CARE_COUNTRY') return forbidden('care_country_mismatch_or_unset')
    if (err instanceof DoctorNotFoundError) return notFound('Doctor not found')
    logger.error('[doctors/[id]/slots/GET] Unexpected error', err)
    return internalError()
  }
}

