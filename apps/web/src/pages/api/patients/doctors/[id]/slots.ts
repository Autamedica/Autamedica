import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { getOpenSlots } from '@autamedica/scheduling'
import type { UUID } from '@autamedica/types'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const supabase = createServerClientFromRequest(request)

    // Auth check via session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const doctorId = params.id
    if (!doctorId) {
      return json({ success: false, error: 'Missing doctor id' }, 400)
    }

    const url = new URL(request.url)
    const dateFrom = url.searchParams.get('from')
    const dateTo = url.searchParams.get('to')

    if (!dateFrom || !dateTo) {
      return json(
        { success: false, error: 'Both "from" and "to" query parameters are required' },
        400,
      )
    }

    if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
      return json(
        { success: false, error: 'Dates must be in YYYY-MM-DD format' },
        400,
      )
    }

    // Validate max 30 day range
    const fromDate = new Date(dateFrom)
    const toDate = new Date(dateTo)
    const daysDiff = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24),
    )

    if (daysDiff < 0) {
      return json({ success: false, error: '"from" must be before "to"' }, 400)
    }

    if (daysDiff > 30) {
      return json(
        { success: false, error: 'Date range must not exceed 30 days' },
        400,
      )
    }

    // Verify doctor exists
    const { data: doctor, error: doctorError } = await supabase
      .from('doctors')
      .select('id')
      .eq('id', doctorId)
      .maybeSingle()

    if (doctorError || !doctor) {
      return json({ success: false, error: 'Doctor not found' }, 404)
    }

    const slots = await getOpenSlots(supabase, {
      doctor_id: doctorId as UUID,
      date_from: dateFrom,
      date_to: dateTo,
    })

    return json({
      success: true,
      data: {
        doctor_id: doctorId,
        date_from: dateFrom,
        date_to: dateTo,
        slots,
        total: slots.length,
      },
    })
  } catch (err) {
    logger.error('[doctors/[id]/slots/GET] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}
