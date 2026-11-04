import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret } from '@/lib/runtime-env'

const REQUEST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AuthorizedPharmacyPaymentRequest {
  id: string
  cloudflare_room_id: string
  care_country: string
  tier_requested: string
  status: string
}

/**
 * Only a cryptographically valid, room-bound token returned during pharmacy
 * intake authorizes creating/viewing the payment for a particular request.
 * CPF/DNI and guessing a UUID can NEVER authorize access.
 */
export async function authorizePharmacyPaymentRequest(
  admin: SupabaseClient,
  requestId: unknown,
  guestToken: unknown,
  runtimeEnv?: Record<string, unknown> | null,
): Promise<AuthorizedPharmacyPaymentRequest | null> {
  if (typeof requestId !== 'string' || !REQUEST_UUID.test(requestId) ||
      typeof guestToken !== 'string' || guestToken.length < 20 ||
      guestToken.length > 4096) return null
  const secret = resolveGuestSecret(runtimeEnv)
  if (!secret) return null
  const guest = await verifyGuestToken(guestToken, secret)
  if (guest?.callId !== requestId) return null

  const { data, error } = await admin.from('pharmacy_dispatch_requests')
    .select('id,cloudflare_room_id,care_country,tier_requested,status')
    .eq('id', requestId).maybeSingle()
  if (error) throw error
  if (guest.roomId !== data?.cloudflare_room_id) return null
  return data as AuthorizedPharmacyPaymentRequest
}
