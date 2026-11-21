import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './recover-queue'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'

vi.mock('@autamedica/shared', () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() }
  logger.child.mockReturnValue(logger)
  return { logger }
})

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: vi.fn(() => supabaseMock) }))
vi.mock('@/lib/runtime-env', () => ({ resolveGuestSecret: vi.fn(() => 'recover-queue-test-secret-long-enough') }))
vi.mock('@/lib/pharmacy/guest-queue-recovery', () => ({
  createGuestQueueRecoveryToken: vi.fn(() => 'a'.repeat(64)),
  hashGuestQueueRecoveryToken: vi.fn(async () => 'b'.repeat(64)),
}))

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const SECRET = 'recover-queue-test-secret-long-enough'
const row = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  status: 'searching',
  created_at: new Date().toISOString(),
  patient_dni: null,
  patient_cpf: '12345678909',
  patient_phone: '+55 (51) 99999-8888',
  patient_name: 'Paciente de prueba',
  cloudflare_room_id: 'guest-room-test',
  care_country: 'BR',
  search_started_at: new Date().toISOString(),
  ...overrides,
})

function chain(data: unknown, error: unknown = null) {
  const result = { data, error }
  const query: Record<string, any> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)),
  }
  for (const method of ['select', 'gte', 'in', 'or', 'order', 'eq', 'update', 'maybeSingle']) {
    query[method] = vi.fn(() => query)
  }
  return query
}

function setup(candidate: unknown, payment: unknown = { status: 'approved' }) {
  const requests = chain(candidate)
  const payments = chain(payment)
  const sessionRead = chain({ request_id: REQUEST_ID })
  const sessionUpdate = chain(null)
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'pharmacy_dispatch_requests') return requests
    if (table === 'pharmacy_dispatch_payments') return payments
    if (table === 'pharmacy_guest_dispatch_sessions') {
      return sessionRead.update.mockImplementation(() => sessionUpdate), sessionRead
    }
    return chain(null)
  })
  return { requests, payments, sessionRead, sessionUpdate }
}

function context(document = '123.456.789-09', phone = '+55 51 99999-8888') {
  return {
    request: new Request('https://example.invalid/api/pharmacy/dispatch/recover-queue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document, phone }),
    }),
    locals: { runtime: { env: { GUEST_TOKEN_SECRET: SECRET } } },
  } as unknown as Parameters<typeof POST>[0]
}

describe('POST /api/pharmacy/dispatch/recover-queue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recovers an exact CPF + WhatsApp match in an active paid queue', async () => {
    setup([row()])
    const response = await POST(context())
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data).toEqual(expect.objectContaining({
      requestId: REQUEST_ID,
      status: 'searching',
      guestToken: expect.any(String),
      recoveryToken: 'a'.repeat(64),
    }))
    const token = await verifyGuestToken(payload.data.guestToken, SECRET)
    expect(token?.callId).toBe(REQUEST_ID)
    expect(token?.roomId).toBe('guest-room-test')
  })

  it('returns 404 when the WhatsApp differs even if the document matches', async () => {
    setup([row()])
    const response = await POST(context('12345678909', '5551999999999'))
    expect(response.status).toBe(404)
  })

  it.each([
    ['cancelled request', [row({ status: 'cancelled' })]],
    ['request older than 24 hours', [row({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })]],
  ])('returns 404 for a %s', async (_label, candidates) => {
    setup(candidates)
    const response = await POST(context())
    expect(response.status).toBe(404)
  })
})
