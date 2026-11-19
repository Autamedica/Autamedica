import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: '11111111-1111-4111-8111-111111111111',
  authError: false,
  rpcError: false,
  claimed: true,
  calls: [] as Record<string, unknown>[],
}))

vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    auth: {
      getUser: async (token: string) => ({
        data: { user: !state.authError && token === 'valid' ? { id: state.userId } : null },
        error: state.authError ? { message: 'token invalid' } : null,
      }),
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.calls.push({ name, ...args })
      return { data: state.claimed, error: state.rpcError ? { message: 'offline' } : null }
    },
  }),
}))

import { POST } from './claim'

function send(clickToken: string, token = 'valid', source = 'play_install_referrer') {
  return POST({
    request: new Request('https://www.autamedica.com/api/partners/claim', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ click_token: clickToken, source }),
    }),
    locals: {},
  } as unknown as Parameters<typeof POST>[0])
}

beforeEach(() => {
  state.authError = false
  state.rpcError = false
  state.claimed = true
  state.calls = []
})

describe('Jordan authenticated attribution claim', () => {
  it('hashes the opaque token and uses the verified auth identity', async () => {
    const response = await send('a'.repeat(32))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ attributed: true })
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0]).toMatchObject({
      name: 'claim_partner_attribution',
      p_patient_user_id: state.userId,
      p_source: 'play_install_referrer',
    })
    expect(state.calls[0].p_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(state.calls[0].p_token_hash).not.toBe('a'.repeat(32))
  })

  it('requires a valid authenticated session', async () => {
    const response = await send('b'.repeat(32), 'invalid')
    expect(response.status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it('rejects malformed tokens without DB access', async () => {
    const response = await send('redirect_https://attacker.invalid')
    expect(response.status).toBe(400)
    expect(state.calls).toHaveLength(0)
  })

  it('does not treat reused or expired tokens as a commission', async () => {
    state.claimed = false
    const response = await send('c'.repeat(32))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ attributed: false })
  })

  it('does not attribute on a backend failure', async () => {
    state.rpcError = true
    const response = await send('d'.repeat(32))
    expect(response.status).toBe(503)
  })
})
