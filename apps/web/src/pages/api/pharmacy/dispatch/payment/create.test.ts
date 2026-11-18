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

vi.mock('@/lib/payments/mercadopago-broker-signature', () => ({
  createMercadoPagoBrokerHeaders: vi.fn(async () => ({
    'Content-Type': 'application/json',
    'x-autamedica-broker-timestamp': '1794920000',
    'x-autamedica-broker-signature': 'a'.repeat(64),
  })),
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
    in: ReturnType<typeof vi.fn>
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
    in: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
  }
  for (const method of ['select', 'eq', 'maybeSingle', 'in', 'insert', 'update', 'single'] as const) {
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
      buildChain({
        referral_partner_id: 'partner-jordan',
        commercial_referral_partners: { code: 'JORDAN', active: true },
      }),
      buildChain({ country_code: 'BR', currency: 'BRL', consultation_price_minor: 7900, doctor_fee_minor: 4000, partner_commission_minor: 1000, require_payment_before_dispatch: true }),
      buildChain({ doctor_fee_minor: 4000, price_minor: 7900, currency: 'BRL' }),
      buildChain(null),
      buildChain({ jordan_qr_payments_enabled: true, pharmacy_express_payments_enabled: true, global_pix_mp_payments_enabled: true }),
      buildChain([
        { scope_key: 'BR', commercial_status: 'enabled', financial_status: 'ready' },
        { scope_key: 'EXPRESS', commercial_status: 'enabled', financial_status: 'ready' },
        { scope_key: 'JORDAN', commercial_status: 'enabled', financial_status: 'ready' },
      ]),
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
    expect(supabaseMock.from).toHaveBeenCalledTimes(8)
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
    expect(supabaseMock.from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when the server-owned country quote is missing or mismatched', async () => {
    const chains = [
      buildChain({
        referral_partner_id: 'partner-jordan',
        commercial_referral_partners: { code: 'JORDAN', active: true },
      }),
      buildChain({ country_code: 'BR', currency: 'BRL', consultation_price_minor: 7900, doctor_fee_minor: 4000 }),
      buildChain({ doctor_fee_minor: 5000, price_minor: 7900, currency: 'BRL' }),
    ]
    supabaseMock.from.mockImplementation(() => chains.shift())

    const response = await POST(makeContext())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error.message).toBe('pharmacy_country_quote_not_verified')
    expect(supabaseMock.from).toHaveBeenCalledTimes(3)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('routes ARS checkout through the Argentina MLA portal broker', async () => {
    paymentAccessMock.authorize.mockResolvedValue({
      id: 'dispatch-1',
      care_country: 'AR',
      tier_requested: 'general',
      status: 'pending_payment',
    })
    const partner = buildChain({
      referral_partner_id: 'partner-jordan',
      commercial_referral_partners: { code: 'JORDAN', active: true },
    })
    const tariff = buildChain({
      country_code: 'AR', currency: 'ARS', consultation_price_minor: 1500000,
      doctor_fee_minor: 800000, partner_commission_minor: 200000,
      require_payment_before_dispatch: true,
    })
    const quote = buildChain({ doctor_fee_minor: 800000, price_minor: 1500000, currency: 'ARS' })
    const oldPayment = buildChain(null)
    const switches = buildChain({
      jordan_qr_payments_enabled: true,
      pharmacy_express_payments_enabled: true,
      global_pix_mp_payments_enabled: true,
    })
    const scopes = buildChain([
      { scope_key: 'AR', commercial_status: 'enabled', financial_status: 'ready' },
      { scope_key: 'EXPRESS', commercial_status: 'enabled', financial_status: 'ready' },
      { scope_key: 'JORDAN', commercial_status: 'enabled', financial_status: 'ready' },
    ])
    const insert = buildChain({ id: 'payment-ar-mercadopago' })
    const saved = buildChain({ id: 'payment-ar-mercadopago' })
    const chains = [partner, tariff, quote, oldPayment, switches, scopes, insert, saved]
    supabaseMock.from.mockImplementation(() => {
      const next = chains.shift()
      if (!next) throw new Error('Unexpected Supabase query')
      return next
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: 'preference-ar-1',
          init_point: 'https://www.mercadopago.com.ar/checkout/test',
        },
      }),
    }))

    const response = await POST(makeContext())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      status: 'pending',
      checkoutUrl: 'https://www.mercadopago.com.ar/checkout/test',
      amountCents: 1500000,
      currency: 'ARS',
    })
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      dispatch_request_id: 'dispatch-1',
      amount_minor: 1500000,
      currency: 'ARS',
      status: 'initializing',
      provider: 'mercadopago',
    }))
    expect(fetch).toHaveBeenCalledWith(
      'https://empresa.autamedica.com/api/ops/mercadopago/argentina-broker',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(supabaseMock.from).toHaveBeenCalledTimes(8)
  })

  it('recovers an old Argentine manual placeholder into a real MLA checkout', async () => {
    paymentAccessMock.authorize.mockResolvedValue({
      id: 'dispatch-1',
      care_country: 'AR',
      tier_requested: 'general',
      status: 'pending_payment',
    })
    const partner = buildChain({
      referral_partner_id: null,
      commercial_referral_partners: null,
    })
    const tariff = buildChain({
      country_code: 'AR', currency: 'ARS', consultation_price_minor: 1500000,
      doctor_fee_minor: 800000, partner_commission_minor: 200000,
      require_payment_before_dispatch: true,
    })
    const quote = buildChain({ doctor_fee_minor: 800000, price_minor: 1500000, currency: 'ARS' })
    const placeholder = buildChain({
      id: 'payment-ar-placeholder',
      status: 'pending',
      checkout_url: null,
      amount_minor: 1500000,
      currency: 'ARS',
      provider: 'manual',
      provider_preference_id: null,
      provider_payment_id: null,
      metadata: { payment_mode: 'manual_pilot', manual_approval_pending: true, country_code: 'AR' },
    })
    const recovered = buildChain({ id: 'payment-ar-placeholder' })
    const saved = buildChain({ id: 'payment-ar-placeholder' })
    const chains = [partner, tariff, quote, placeholder, recovered, saved]
    supabaseMock.from.mockImplementation(() => {
      const next = chains.shift()
      if (!next) throw new Error('Unexpected Supabase query')
      return next
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: 'preference-ar-recovered',
          init_point: 'https://www.mercadopago.com.ar/checkout/recovered',
        },
      }),
    }))

    const response = await POST(makeContext())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      status: 'pending',
      checkoutUrl: 'https://www.mercadopago.com.ar/checkout/recovered',
      currency: 'ARS',
    })
    expect(recovered.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'initializing',
      provider: 'mercadopago',
      metadata: expect.objectContaining({
        payment_mode: 'mercadopago',
        manual_approval_pending: false,
        recovered_from_manual_placeholder_at: expect.stringMatching(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}/),
      }),
    }))
    const recoveryPayload = recovered.update.mock.calls[0]?.[0] as {
      provider?: string
      status?: string
      metadata?: Record<string, unknown>
    }
    expect(recoveryPayload).toMatchObject({
      provider: 'mercadopago',
      status: 'initializing',
      metadata: {
        payment_mode: 'mercadopago',
        manual_approval_pending: false,
      },
    })
    expect(typeof recoveryPayload.metadata?.recovered_from_manual_placeholder_at).toBe('string')
    expect(fetch).toHaveBeenCalledWith(
      'https://empresa.autamedica.com/api/ops/mercadopago/argentina-broker',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(supabaseMock.from).toHaveBeenCalledTimes(6)
  })

})
