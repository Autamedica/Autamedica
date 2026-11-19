import { describe, expect, it, vi, beforeEach } from 'vitest'

let verifiedGuest: { roomId: string; callId: string } | null = { roomId: 'room-jordan-1', callId: 'call-1' }
let dispatchAccessResult: { kind: 'allowed' } | { kind: 'forbidden' } | { kind: 'conflict'; message: string } = { kind: 'allowed' }
let mediaAccessResult: 'allowed' | 'payment_required' = 'allowed'

const sfuProxyMock = vi.fn(async () => ({
  status: 200,
  headers: { 'Content-Type': 'application/json' },
  body: { sessionId: 'cf-session-1' },
}))

vi.mock('@/lib/runtime-env', () => ({
  resolveGuestSecret: () => 'guest-secret-2026',
  resolveCloudflareCallsEnv: () => ({ appId: 'cf-app', appSecret: 'cf-secret' }),
}))

vi.mock('@/lib/calls/lib/guest-token', () => ({
  verifyGuestToken: vi.fn(async () => verifiedGuest),
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({}),
}))

vi.mock('@/lib/calls/lib/guest-dispatch-access', () => ({
  verifyGuestDispatchAccess: vi.fn(async () => dispatchAccessResult),
}))

vi.mock('@/lib/pharmacy/payments/jordan-media-access', () => ({
  checkJordanMediaAccess: vi.fn(async () => mediaAccessResult),
}))

vi.mock('@/lib/calls/sfu-room-binding', () => ({
  handleRoomBoundCloudflareProxy: (...args: unknown[]) => sfuProxyMock(...args),
}))

import { POST } from './cloudflare-calls'

describe('POST /api/calls/guest/cloudflare-calls Jordan media gate integration', () => {
  beforeEach(() => {
    verifiedGuest = { roomId: 'room-jordan-1', callId: 'call-1' }
    dispatchAccessResult = { kind: 'allowed' }
    mediaAccessResult = 'allowed'
    sfuProxyMock.mockClear()
  })

  it('blocks forged roomId with 403 before touching Cloudflare SFU', async () => {
    const res = await POST({
      request: new Request('https://autamedica.com/api/calls/guest/cloudflare-calls?token=valid-token', {
        method: 'POST',
        body: JSON.stringify({ roomId: 'room-other-forged' }),
      }),
      locals: { runtime: { env: {} } },
    } as never)

    expect(res.status).toBe(403)
    expect(sfuProxyMock).not.toHaveBeenCalled()
  })

  it('blocks unpaid Brazil Jordan guest calls with 402 before touching Cloudflare SFU', async () => {
    mediaAccessResult = 'payment_required'
    const res = await POST({
      request: new Request('https://autamedica.com/api/calls/guest/cloudflare-calls?token=valid-token', {
        method: 'POST',
        body: JSON.stringify({ roomId: 'room-jordan-1' }),
      }),
      locals: { runtime: { env: {} } },
    } as never)

    expect(res.status).toBe(402)
    expect(sfuProxyMock).not.toHaveBeenCalled()
  })

  it('forwards to Cloudflare SFU only when guest token, dispatch access, and Jordan payment gate all pass', async () => {
    const res = await POST({
      request: new Request('https://autamedica.com/api/calls/guest/cloudflare-calls?token=valid-token', {
        method: 'POST',
        body: JSON.stringify({ roomId: 'room-jordan-1' }),
      }),
      locals: { runtime: { env: {} } },
    } as never)

    expect(res.status).toBe(200)
    expect(sfuProxyMock).toHaveBeenCalledTimes(1)
  })
})
