import type { SupabaseClient } from '@supabase/supabase-js'

export interface SignedGuestRoom {
  callId: string
  roomId: string
}

export type GuestDispatchDecision =
  | { kind: 'ok'; dispatchRequestId: string | null }
  | { kind: 'forbidden' }
  | { kind: 'conflict'; message: 'dispatch_not_ready' | 'pharmacy_payment_required' }

/**
 * Server-side enforcement for Android QR consultations.
 *
 * A room-bound token is not itself evidence that a doctor has accepted
 * a request, nor that the patient has paid. Keep existing non-dispatch
 * guest calls intact. Fail closed on database errors.
 *
 * The BR partner payment check is independent of the Android UI and
 * feature flag, preventing old app versions from joining for free.
 */
export async function verifyGuestDispatchAccess(
  admin: SupabaseClient,
  guest: SignedGuestRoom,
): Promise<GuestDispatchDecision> {
  const { data: dispatch, error } = await admin
    .from('pharmacy_dispatch_requests')
    .select('id,call_id,cloudflare_room_id,status,care_country,referral_partner_id,assigned_doctor_id,commercial_referral_partners!pharmacy_dispatch_requests_referral_partner_id_fkey(code,active)')
    .eq('cloudflare_room_id', guest.roomId)
    .maybeSingle()

  if (error) throw new Error('dispatch_access_check_unavailable')
  if (!dispatch) return { kind: 'ok', dispatchRequestId: null }

  // The JWT was minted by the dispatch intake. Do not let a valid token
  // for another room or a legacy call read a dispatch belonging to others.
  if (dispatch.cloudflare_room_id !== guest.roomId ||
    (guest.callId !== dispatch.id && guest.callId !== dispatch.call_id)) {
    return { kind: 'forbidden' }
  }
  if (!['matched', 'in_call'].includes(dispatch.status) || !dispatch.assigned_doctor_id || !dispatch.call_id) {
    return { kind: 'conflict', message: 'dispatch_not_ready' }
  }

  const partner = dispatch.commercial_referral_partners as { code?: string; active?: boolean } | null
  if (dispatch.care_country === 'BR' && partner?.code === 'JORDAN') {
    const { data: payment, error: paymentError } = await admin
      .from('pharmacy_dispatch_payments')
      .select('id')
      .eq('dispatch_request_id', dispatch.id)
      .eq('status', 'approved')
      .maybeSingle()

    if (paymentError) throw new Error('dispatch_payment_check_unavailable')
    if (!payment) return { kind: 'conflict', message: 'pharmacy_payment_required' }
  }

  return { kind: 'ok', dispatchRequestId: dispatch.id as string }
}
