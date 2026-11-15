import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { internalError, jsonOk, badRequest } from '@/lib/api-helpers'
import { doctorsRepo } from '@/lib/doctors/lib/repos/doctors'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth
  try {
    const doctorId = await doctorsRepo.resolveIdByUserId(auth.user.id, auth.supabase)
    if (!doctorId) return badRequest('doctor_not_found')
    const db = auth.supabase as unknown as SupabaseClient
    const { data, error } = await db.from('doctor_earnings')
      .select('id, gross_amount, net_amount, currency, status, created_at, paid_at, metadata, dispatch_request_id, appointment_id')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    const earnings = (data ?? []).filter((row) => row.currency === 'BRL' || row.currency === 'ARS')
    return jsonOk({ earnings })
  } catch (error) {
    logger.error('[accounting/earnings] GET failed', error)
    return internalError('doctor_earnings_unavailable')
  }
}
