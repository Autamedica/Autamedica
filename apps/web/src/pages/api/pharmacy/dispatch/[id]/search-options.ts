import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { badRequest, conflict, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { logger } from '@autamedica/shared'

type SearchMode = 'continue_local' | 'international'

async function authorizePatientDispatch(
  request: Request,
  locals: Parameters<APIRoute>[0]['locals'],
  admin: SupabaseClient,
  requestRecord: {
    id: string
    patient_id: string | null
    requested_by_user_id: string | null
    care_country: string | null
    cloudflare_room_id: string
  },
): Promise<boolean> {
  const header = request.headers.get('x-guest-token')?.trim() || ''
  const authorization = request.headers.get('authorization')?.trim() || ''
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : ''
  const urlToken = new URL(request.url).searchParams.get('token')?.trim() || ''
  const candidate = header || bearer || urlToken

  if (candidate) {
    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) return false
    const guest = await verifyGuestToken(candidate, secret)
    if (guest?.callId === requestRecord.id && guest.roomId === requestRecord.cloudflare_room_id) {
      return true
    }
  }

  const patient = await resolvePatientContext(request, locals).catch(() => null)
  return Boolean(
    patient &&
    requestRecord.patient_id === patient.patientId &&
    requestRecord.requested_by_user_id === patient.userId &&
    requestRecord.care_country === patient.careCountry
  )
}

/**
 * GET /api/pharmacy/dispatch/[id]/search-options
 * Returns only anonymous counts and route availability after the local 15-minute stage.
 * POST advances the patient's own search to another local stage or an enabled cross-border route.
 */
export const GET: APIRoute = async ({ params, request, locals }) => {
  const id = params.id?.trim()
  if (!id) return notFound('missing_request_id')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: requestRecord, error } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id,patient_id,requested_by_user_id,care_country,cloudflare_room_id,status,search_started_at,international_search_enabled')
      .eq('id', id)
      .maybeSingle()

    if (error || !requestRecord) return notFound('request_not_found')
    if (!await authorizePatientDispatch(request, locals, admin, requestRecord)) return unauthorized()
    if (requestRecord.status !== 'searching') return conflict('request_not_searching')

    const { data: availability, error: capacityError } = await admin.rpc(
      'get_pharmacy_dispatch_international_capacity',
      { p_dispatch_id: id },
    )
    if (capacityError) {
      logger.error('[api/pharmacy/dispatch/search-options] capacity_lookup_failed', {
        code: capacityError.code ?? 'INTERNAL',
      })
      return internalError('international_capacity_unavailable')
    }

    return jsonOk({
      search_started_at: requestRecord.search_started_at,
      international_search_enabled: requestRecord.international_search_enabled === true,
      availability: availability ?? {
        available: false,
        eligible_doctors: 0,
        routes: [],
        code: 'INTERNATIONAL_CAPACITY_UNAVAILABLE',
      },
    })
  } catch (error) {
    logger.error('[api/pharmacy/dispatch/search-options] GET failed', {
      name: error instanceof Error ? error.name : typeof error,
    })
    return internalError('search_options_unavailable')
  }
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const id = params.id?.trim()
  if (!id) return notFound('missing_request_id')

  try {
    const body = await request.json().catch(() => null) as { mode?: unknown } | null
    const mode = body?.mode
    if (mode !== 'continue_local' && mode !== 'international') {
      return badRequest('invalid_search_mode')
    }

    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: requestRecord, error } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id,patient_id,requested_by_user_id,care_country,cloudflare_room_id,status')
      .eq('id', id)
      .maybeSingle()

    if (error || !requestRecord) return notFound('request_not_found')
    if (!await authorizePatientDispatch(request, locals, admin, requestRecord)) return unauthorized()
    if (requestRecord.status !== 'searching') return conflict('request_not_searching')

    const { data: result, error: advanceError } = await admin.rpc(
      'advance_pharmacy_dispatch_search',
      { p_dispatch_id: id, p_mode: mode as SearchMode },
    )
    if (advanceError) {
      logger.error('[api/pharmacy/dispatch/search-options] advance_failed', {
        code: advanceError.code ?? 'INTERNAL',
      })
      return internalError('search_transition_failed')
    }

    if (!result?.success) {
      const code = typeof result?.code === 'string' ? result.code : 'SEARCH_TRANSITION_REJECTED'
      if (code === 'INTERNATIONAL_ROUTE_UNAVAILABLE') {
        return conflict('international_route_unavailable')
      }
      if (code === 'LOCAL_SEARCH_IN_PROGRESS') return conflict('local_search_in_progress')
      if (code === 'DOCTOR_OFFER_IN_PROGRESS') return conflict('doctor_offer_in_progress')
      if (code === 'REQUEST_NOT_SEARCHING') return conflict('request_not_searching')
      return conflict(code.toLowerCase())
    }

    return jsonOk(result)
  } catch (error) {
    logger.error('[api/pharmacy/dispatch/search-options] POST failed', {
      name: error instanceof Error ? error.name : typeof error,
    })
    return internalError('search_transition_failed')
  }
}
