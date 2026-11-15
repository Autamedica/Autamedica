import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, forbidden, internalError, jsonFail, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth
  try {
    const body = await request.json().catch(() => null) as { requestId?: unknown; roomId?: unknown } | null
    const requestId = typeof body?.requestId === 'string' && UUID.test(body.requestId) ? body.requestId : null
    const roomId = typeof body?.roomId === 'string' && body.roomId.trim().length <= 255 ? body.roomId.trim() : null
    if ((body?.requestId !== undefined && !requestId) || (!requestId && !roomId)) {
      return badRequest('request_or_room_id_required')
    }
    const admin = createAstroAdminClient(locals.runtime?.env)
    const dispatchAdmin = admin as unknown as SupabaseClient
    const { data: doctor, error: doctorError } = await admin.from('doctors')
      .select('id, active').eq('user_id', auth.user.id).maybeSingle()
    if (doctorError) return internalError('doctor_lookup_failed')
    if (!doctor?.id || doctor.active !== true) return forbidden('active_doctor_required')
    let query = dispatchAdmin.from('pharmacy_dispatch_requests')
      .select('id, assigned_doctor_id, cloudflare_room_id, status')
    if (requestId) query = query.eq('id', requestId)
    if (roomId) query = query.eq('cloudflare_room_id', roomId)
    const { data: dispatch, error: dispatchError } = await query.maybeSingle()
    if (dispatchError) return internalError('pharmacy_dispatch_lookup_failed')
    if (!dispatch) return requestId ? jsonFail('NOT_FOUND', 'pharmacy_dispatch_not_found', 404) : jsonOk({ completed: false, skipped: true })
    if (dispatch.assigned_doctor_id !== doctor.id) return forbidden('dispatch_not_assigned_to_doctor')
    if (dispatch.status === 'completed') return jsonOk({ completed: true, alreadyCompleted: true, requestId: dispatch.id })
    if (dispatch.status === 'cancelled' || dispatch.status === 'expired') return forbidden('dispatch_not_completable')
    const { data: result, error: rpcError } = await dispatchAdmin.rpc('finish_pharmacy_consultation', {
      p_doctor_id: doctor.id,
      p_request_id: dispatch.id,
    })
    if (rpcError) {
      logger.error('[api/doctors/on-duty/complete] finish_pharmacy_consultation failed', { code: rpcError.code ?? 'INTERNAL' })
      return internalError('pharmacy_dispatch_completion_failed')
    }
    return jsonOk({ completed: true, requestId: dispatch.id, result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[api/doctors/on-duty/complete] POST error', { message })
    return internalError('pharmacy_dispatch_completion_failed')
  }
}
