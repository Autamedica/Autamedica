import type { SupabaseClient } from '@supabase/supabase-js'
import { checkJordanMediaAccess } from '@/lib/pharmacy/payments/jordan-media-access'

export type WebMediaRole = 'doctor' | 'patient'
export type WebMediaDecision = 'allowed' | 'forbidden' | 'payment_required'

/**
 * Authorize the authenticated user for the actual room before proxying SFU
 * operations. No role-only access and no CPF/DNI/phone identity matching.
 * The room comes from the API envelope, NEVER from a "paid" client flag.
 */
export async function authorizeWebCloudflareMedia(
  admin: SupabaseClient,
  roomId: string,
  userId: string,
  role: WebMediaRole,
): Promise<WebMediaDecision> {
  if (!roomId || roomId.length > 200 || !userId) return 'forbidden'

  // Dispatch provenance must take precedence over a parallel call row.
  const { data: dispatch, error: dispatchError } = await admin
    .from('pharmacy_dispatch_requests')
    .select('id,status,assigned_doctor_id,patient_id,requested_by_user_id')
    .eq('cloudflare_room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (dispatchError) throw dispatchError

  if (dispatch) {
    if (['completed','cancelled','canceled','expired'].includes(dispatch.status)) return 'forbidden'
    const participantId = role === 'doctor'
      ? dispatch.assigned_doctor_id as string | null
      : (dispatch.requested_by_user_id ?? dispatch.patient_id) as string | null
    if (!participantId) return 'forbidden'
    if (!await isUserParticipant(admin, participantId, userId, role)) return 'forbidden'

    return await checkJordanMediaAccess(admin, roomId)
  }

  const { data: call, error: callError } = await admin
    .from('calls')
    .select('doctor_id,patient_id,status')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (callError) throw callError
  if (!call || ['ended','declined','canceled','cancelled'].includes(call.status)) return 'forbidden'

  const participantId = role === 'doctor'
    ? call.doctor_id as string | null
    : call.patient_id as string | null
  if (!participantId) return 'forbidden'
  return await isUserParticipant(admin, participantId, userId, role) ? 'allowed' : 'forbidden'
}

async function isUserParticipant(
  admin: SupabaseClient,
  participantId: string,
  userId: string,
  role: WebMediaRole,
): Promise<boolean> {
  if (participantId === userId) return true

  const table = role === 'doctor' ? 'doctors' : 'patients'
  const { data, error } = await admin
    .from(table)
    .select('user_id')
    .eq('id', participantId)
    .maybeSingle()
  if (error) throw error
  return data?.user_id === userId
}
