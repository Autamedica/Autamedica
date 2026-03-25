import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { getOpenSlots } from '@autamedica/scheduling'
import type { UUID } from '@autamedica/types'
import { jsonOk, badRequest, notFound, internalError, unauthorized } from '@/lib/api-helpers'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const GET: APIRoute = async ({ request, params, locals }) => {
  try {
    // Use session from middleware (already validated via getUser() + refreshed if needed)
    if (!locals.session) return unauthorized()
    const supabase = locals.supabase

    const doctorId = params.id
    if (!doctorId) {
      return badRequest('Missing doctor id')
    }

    const url = new URL(request.url)
    const dateFrom = url.searchParams.get('from')
    const dateTo = url.searchParams.get('to')

    if (!dateFrom || !dateTo) {
      return badRequest('Both "from" and "to" query parameters are required')
    }

    if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
      return badRequest('Dates must be in YYYY-MM-DD format')
    }

    // Validate max 30 day range
    const fromDate = new Date(dateFrom)
    const toDate = new Date(dateTo)
    const daysDiff = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24),
    )

    if (daysDiff < 0) {
      return badRequest('"from" must be before "to"')
    }

    if (daysDiff > 30) {
      return badRequest('Date range must not exceed 30 days')
    }

    // Verify doctor exists
    const { data: doctor, error: doctorError } = await supabase
      .from('doctors')
      .select('id')
      .eq('id', doctorId)
      .maybeSingle()

    if (doctorError || !doctor) {
      return notFound('Doctor not found')
    }

    const slots = await getOpenSlots(supabase, {
      doctor_id: doctorId as UUID,
      date_from: dateFrom,
      date_to: dateTo,
    })

    return jsonOk({
      doctor_id: doctorId,
      date_from: dateFrom,
      date_to: dateTo,
      slots,
      total: slots.length,
    })
  } catch (err) {
    logger.error('[doctors/[id]/slots/GET] Unexpected error', err)
    return internalError()
  }
}
