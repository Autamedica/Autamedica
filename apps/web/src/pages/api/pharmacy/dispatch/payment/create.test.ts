import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './create'

const { supabaseMock, paymentAccessMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  paymentAccessMock: {
    authorize: vi.fn(),
    hasSecureSecret: vi.fn(),
  },
}))

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => supabaseMock),
}))

vi.mock('@/lib/runtime-env', () => ({
  getRuntimeEnvValue: vi.fn(() => undefined),
}))

vi.mock('@/lib/pharmacy/payments/guest-payment-access', () => ({
  authorizePharmacyPaymentRequest: paymentAccessMock.authorize,
  hasSecureGuestPaymentSecret: paymentAccessMock.hasSecureSecret,
}))

function buildChain(data: unknown, error: unknown = null) {
  const chain: {
    then: (resolve: (value: unknown) => void) => void
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    maybeSingle: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
  } = {
    then(resolve) {
      resolve({ data, error })
    },
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
  }
  for (const method of ['select', 'eq', 'maybeSingle', 'insert', 'update', 'single'] as const) {
    chain[method].mockReturnValue(chain)
  }
  return chain
}

function makeContext(): Parameters<typeof POST>[0] {
  return {
    request: new Request('https://autamedica.test/api/pharmacy/dispatch/payment/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'dispatch-1', accessToken: 'signed-test-token' }),
    }),
    locals: {
      runtime: {
        env: {
          ENABLE_JORDAN_PAYMENTS: 'true',
          GUEST_TOKEN_SECRET: 'test-guest-secret-long-enough-for-security',
          MERCADOPAGO_ACCESS_TOKEN: 'test-provider-token',
          PUBLIC_APP_URL: 'https://autamedica.test',
        },
      },
    },
  } as unknown as Parameters<typeof POST>[0]
}

describe('API: /api/pharmacy/dispatch/payment/create pay-first', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    paymentAccessMock.hasSecureSecret.mockReturnValue(true)
    paymentAccessMock.authorize.mockResolvedValue({
      id: 'dispatch-1',
      care_country: 'BR',
      tier_requested: 'general',
      status: 'searching',
    })
    const chains = [
      buildChain({ jordan_qr_payments_enabled: true, pharmacy_express_payments_enabled: true, global_pix_mp_payments_enabled: true }),
      buildChain({
        referral_partner_id: 'partner-jordan',
        commercial_referral_partners: { code: 'JORDAN', active: true },
      }),
      buildChain({ doctor_fee_brl: 40, price_brl: 79 }),
      buildChain(null),
      buildChain({ id: 'payment-1' }),
      buildChain({ id: 'payment-1' }),
    ]
    supabaseMock.from.mockImplementation(() => {
      const next = chains.shift()
      if (!next) throw new Error('Unexpected Supabase query')
      return next
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'preference-1',
        init_point: 'https://www.mercadopago.com.br/checkout/test',
      }),
    }))
  })

  it('creates checkout while a Jordan BR request is still searching', async () => {
    const response = await POST(makeContext())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('pending')
    expect(body.data.checkoutUrl).toBe('https://www.mercadopago.com.br/checkout/test')
    expect(paymentAccessMock.authorize).toHaveBeenCalledWith(
      supabaseMock,
      'dispatch-1',
      'signed-test-token',
      expect.objectContaining({
        ENABLE_JORDAN_PAYMENTS: 'true',
      }),
    )
    expect(supabaseMock.from).toHaveBeenCalledTimes(6)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not create checkout after a request has reached a terminal state', async () => {
    paymentAccessMock.authorize.mockResolvedValue({
      id: 'dispatch-1',
      care_country: 'BR',
      tier_requested: 'general',
      status: 'completed',
    })

    const response = await POST(makeContext())
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.message).toBe('pharmacy_payment_request_not_payable')
    expect(supabaseMock.from).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when the server-owned R$79/R$40 quote is missing or mismatched', async () => {
    const chains = [
      buildChain({ jordan_qr_payments_enabled: true, pharmacy_express_payments_enabled: true, global_pix_mp_payments_enabled: true }),
      buildChain({
        referral_partner_id: 'partner-jordan',
        commercial_referral_partners: { code: 'JORDAN', active: true },
      }),
      buildChain({ doctor_fee_brl: 50, price_brl: 79 }),
    ]
    supabaseMock.from.mockImplementation(() => chains.shift())

    const response = await POST(makeContext())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error.message).toBe('jordan_medical_quote_not_verified')
    expect(supabaseMock.from).toHaveBeenCalledTimes(3)
    expect(fetch).not.toHaveBeenCalled()
  })
})
