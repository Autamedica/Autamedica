import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { authorizePharmacyPaymentRequest, hasSecureGuestPaymentSecret } from './guest-payment-access'
import { resolveGuestSecret } from '@/lib/runtime-env'

vi.mock('@/lib/runtime-env', () => ({
  resolveGuestSecret: vi.fn(() => 'synthetic-secret-for-test-only-minimum-32'),
}))

const ID = '11111111-1111-4111-8111-111111111111'
const ROOM = 'cf-room-general-synthetic-demo'

function mockAdmin(roomId: string) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: ID, cloudflare_room_id: roomId,
      care_country: 'BR', tier_requested: 'general', status: 'in_call',
    }, error: null,
  })
  const chain = { eq: vi.fn(), select: vi.fn(), maybeSingle }
  chain.eq.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  const admin = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient
  return { admin, maybeSingle }
}

describe('pharmacy payment guest authorization', () => {
  it('rejects forged identifiers and empty tokens without DB read', async () => {
    const { admin } = mockAdmin(ROOM)
    expect(await authorizePharmacyPaymentRequest(admin,'bad-request','not-a-token')).toBeNull()
    expect(await authorizePharmacyPaymentRequest(admin,ID,'not-a-token')).toBeNull()
    expect(admin.from).not.toHaveBeenCalled()
  })
  it('accepts a signed call token only for its own dispatch and room', async () => {
    const guest = await signGuestToken({ callId: ID, roomId: ROOM, guestName:'Synthetic' },'synthetic-secret-for-test-only-minimum-32')
    const { admin } = mockAdmin(ROOM)
    const authorized = await authorizePharmacyPaymentRequest(admin,ID,guest)
    expect(authorized?.id).toBe(ID)
    expect(authorized?.care_country).toBe('BR')
  })
  it('refuses checkout based on the known legacy guest-token fallback', async () => {
    vi.mocked(resolveGuestSecret).mockReturnValueOnce('am-guest-default-fallback-secret-2026')
    expect(hasSecureGuestPaymentSecret()).toBe(false)
    vi.mocked(resolveGuestSecret).mockReturnValueOnce('am-guest-default-fallback-secret-2026')
    const insecure = await signGuestToken(
      { callId: ID, roomId: ROOM, guestName: 'Synthetic' },
      'am-guest-default-fallback-secret-2026',
    )
    const { admin } = mockAdmin(ROOM)
    expect(await authorizePharmacyPaymentRequest(admin, ID, insecure)).toBeNull()
    expect(admin.from).not.toHaveBeenCalled()
  })
  it('handles malformed guest JWT without exposing an HTTP 500', async () => {
    const { admin } = mockAdmin(ROOM)
    expect(await authorizePharmacyPaymentRequest(admin, ID, 'a'.repeat(40))).toBeNull()
  })
  it('rejects room mismatch even if request ID and JWT signature are valid', async () => {
    const guest = await signGuestToken({ callId: ID, roomId: ROOM, guestName:'Synthetic' },'synthetic-secret-for-test-only-minimum-32')
    const { admin } = mockAdmin('cf-room-unrelated')
    expect(await authorizePharmacyPaymentRequest(admin,ID,guest)).toBeNull()
  })
  it('rejects tokens signed for another dispatch', async () => {
    const guest = await signGuestToken({
      callId: '22222222-2222-4222-8222-222222222222', roomId: ROOM, guestName:'Synthetic',
    },'synthetic-secret-for-test-only-minimum-32')
    const { admin } = mockAdmin(ROOM)
    expect(await authorizePharmacyPaymentRequest(admin,ID,guest)).toBeNull()
    expect(admin.from).not.toHaveBeenCalled()
  })
})
