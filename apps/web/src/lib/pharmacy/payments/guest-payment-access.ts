import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret } from '@/lib/runtime-env'

const REQUEST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const UNSAFE_GUEST_SECRET_FALLBACK = 'am-guest-default-fallback-secret-2026'

/** The legacy fallback must never be accepted to authorize a money movement. */
export function hasSecureGuestPaymentSecret(runtimeEnv?: Record<string, unknown> | null): boolean {
  const secret = resolveGuestSecret(runtimeEnv)
  return typeof secret === 'string' && secret.length >= 32 &&
    secret !== UNSAFE_GUEST_SECRET_FALLBACK
}

export interface AuthorizedPharmacyPaymentRequest {
  id: string
  cloudflare_room_id: string
  care_country: string
  tier_requested: string
  status: string
}

/**
 * Only a cryptographically valid, room-bound token returned during pharmacy
 * intake OR an authenticated Supabase session matching requested_by_user_id
 * authorizes creating/viewing the payment for a particular request.
 * CPF/DNI and guessing a UUID can NEVER authorize access.
 */
export async function authorizePharmacyPaymentRequest(
  admin: SupabaseClient,
  requestId: unknown,
  guestToken: unknown,
  runtimeEnv?: Record<string, unknown> | null,
  authorizationHeader?: string | null,
): Promise<AuthorizedPharmacyPaymentRequest | null> {
  if (typeof requestId !== 'string' || !REQUEST_UUID.test(requestId)) return null

  const hasGuestTokenCandidate = guestToken != null &&
    !(typeof guestToken === 'string' && guestToken.trim() === '')

  if (hasGuestTokenCandidate) {
    if (typeof guestToken !== 'string' || guestToken.length < 20 || guestToken.length > 4096) {
      return null
    }
    if (!hasSecureGuestPaymentSecret(runtimeEnv)) return null
    const secret = resolveGuestSecret(runtimeEnv)
    if (!secret) return null
    // Invalid JWT/Base64 must be treated as an authentication failure, not HTTP 500.
    let guest: Awaited<ReturnType<typeof verifyGuestToken>>
    try {
      guest = await verifyGuestToken(guestToken, secret)
    } catch {
      return null
    }
    if (guest?.callId !== requestId) return null

    const { data, error } = await admin.from('pharmacy_dispatch_requests')
      .select('id,cloudflare_room_id,care_country,tier_requested,status')
      .eq('id', requestId).maybeSingle()
    if (error) throw error
    if (guest.roomId !== data?.cloudflare_room_id) return null
    return data as AuthorizedPharmacyPaymentRequest
  }

  const bearerMatch = typeof authorizationHeader === 'string'
    ? /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(authorizationHeader.trim())
    : null
  if (!bearerMatch) return null

  const { data: identity, error: identityError } = await admin.auth.getUser(bearerMatch[1])
  if (identityError || !identity?.user?.id) return null

  const { data, error } = await admin.from('pharmacy_dispatch_requests')
    .select('id,cloudflare_room_id,care_country,tier_requested,status,requested_by_user_id')
    .eq('id', requestId).maybeSingle()
  if (error) throw error
  if (!data) return null
  if (data.requested_by_user_id !== identity.user.id) return null

  return {
    id: data.id,
    cloudflare_room_id: data.cloudflare_room_id,
    care_country: data.care_country,
    tier_requested: data.tier_requested,
    status: data.status,
  } as AuthorizedPharmacyPaymentRequest
}
