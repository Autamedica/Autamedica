import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './resume'
import { hashGuestQueueRecoveryToken } from '@/lib/pharmacy/guest-queue-recovery'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'

vi.mock('@autamedica/shared', () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() }
  logger.child.mockReturnValue(logger)
  return { logger }
})

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), auth: { getUser: vi.fn() } },
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => supabaseMock),
}))

const SECRET = 'sufficiently-long-synthetic-test-secret-guest'
vi.mock('@/lib/runtime-env', () => ({
  resolveGuestSecret: vi.fn(() => SECRET),
}))

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const RECOVERY_TOKEN = 'a'.repeat(64)

function chain(data: unknown, error: unknown = null) {
  const value = { data, error }
  const self = {
    then(resolve: (payload: unknown) => unknown) { return Promise.resolve(resolve(value)) },
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
  }
  self.select.mockReturnValue(self)
  self.eq.mockReturnValue(self)
  self.is.mockReturnValue(self)
  self.update.mockReturnValue(self)
  self.maybeSingle.mockReturnValue(self)
  return self
}

function context(recoveryToken: string, authorization?: string): Parameters<typeof POST>[0] {
  return {
    request: new Request('https://example.invalid/api/pharmacy/dispatch/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify({ requestId: REQUEST_ID, recoveryToken }),
    }),
    locals: { runtime: { env: { GUEST_TOKEN_SECRET: SECRET } } },
  } as unknown as Parameters<typeof POST>[0]
}

describe('anonymous pharmacy queue recovery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renews a room-bound clinical JWT only for the valid recovery token', async () => {
    const digest = await hashGuestQueueRecoveryToken(RECOVERY_TOKEN)
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_guest_dispatch_sessions') return chain({
        request_id: REQUEST_ID,
        token_sha256: digest,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        revoked_at: null,
      })
      if (table === 'pharmacy_dispatch_requests') return chain({
        id: REQUEST_ID,
        cloudflare_room_id: 'guest-ar-test-room',
        care_country: 'AR',
        patient_name: 'Synthetic Guest',
        patient_phone: '000000000',
        status: 'searching',
        created_at: '2026-11-05T00:00:00Z',
      })
      return chain(null)
    })

    const response = await POST(context(RECOVERY_TOKEN))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.request.id).toBe(REQUEST_ID)
    const signed = await verifyGuestToken(body.data.accessToken, SECRET)
    expect(signed?.callId).toBe(REQUEST_ID)
    expect(signed?.roomId).toBe('guest-ar-test-room')
  })

  it('requires both owner bearer and device secret to restore an authenticated BR queue', async () => {
    const digest = await hashGuestQueueRecoveryToken(RECOVERY_TOKEN)
    const ownerId = '22222222-2222-4222-8222-222222222222'
    const reqRow = {
      id: REQUEST_ID, requested_by_user_id: ownerId,
      cloudflare_room_id: 'cf-room-br-owner', care_country: 'BR',
      referral_partner_id: '33333333-3333-4333-8333-333333333333',
      patient_name: 'Paciente BR', patient_phone: '+5551987654321',
      status: 'searching', created_at: '2026-11-05T00:00:00Z',
    }
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_guest_dispatch_sessions') return chain({
        request_id: REQUEST_ID, token_sha256: digest,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        revoked_at: null,
      })
      if (table === 'pharmacy_dispatch_requests') return chain(reqRow)
      return chain(null)
    })
    let response = await POST(context(RECOVERY_TOKEN))
    expect(response.status).toBe(401)

    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: '44444444-4444-4444-8444-444444444444' } }, error: null,
    })
    response = await POST(context(RECOVERY_TOKEN, 'Bearer wrong-owner-jwt'))
    expect(response.status).toBe(401)

    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null })
    response = await POST(context(RECOVERY_TOKEN, 'Bearer correct-owner-jwt'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.request.referral_partner_id).toBe(reqRow.referral_partner_id)
    const token = await verifyGuestToken(payload.data.accessToken, SECRET)
    expect(token?.roomId).toBe('cf-room-br-owner')
    expect(supabaseMock.auth.getUser).toHaveBeenCalledWith('correct-owner-jwt')
  })

  it('denies a different 256-bit token without disclosing the request', async () => {
    const digest = await hashGuestQueueRecoveryToken(RECOVERY_TOKEN)
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'pharmacy_guest_dispatch_sessions') return chain({
        request_id: REQUEST_ID,
        token_sha256: digest,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        revoked_at: null,
      })
      return chain(null)
    })
    const response = await POST(context('b'.repeat(64)))
    expect(response.status).toBe(401)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('pharmacy_dispatch_requests')
  })
})
