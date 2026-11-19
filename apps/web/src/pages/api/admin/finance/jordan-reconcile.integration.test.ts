import { describe, expect, it, vi, beforeEach } from 'vitest'

const DISPATCH_ID = '11111111-1111-4111-8111-111111111111'

let dispatchRow: Record<string, unknown> | null = null
let partnerRow: Record<string, unknown> | null = null
let localPaymentRow: Record<string, unknown> | null = null

vi.mock('@/lib/api-auth', () => ({
  withAuthRole: vi.fn(async () => ({ user: { id: 'admin-1' }, role: 'admin' })),
  isAuthed: () => true,
}))

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'pharmacy_dispatch_requests') return { data: dispatchRow, error: null }
            if (table === 'commercial_referral_partners') return { data: partnerRow, error: null }
            if (table === 'pharmacy_dispatch_payments') return { data: localPaymentRow, error: null }
            return { data: null, error: null }
          },
        }),
      }),
    }),
  }),
}))

import { POST } from './jordan-reconcile'

describe('POST /api/admin/finance/jordan-reconcile integration contract', () => {
  beforeEach(() => {
    dispatchRow = { id: DISPATCH_ID, referral_partner_id: 'partner-jordan', care_country: 'BR' }
    partnerRow = { code: 'JORDAN' }
    localPaymentRow = {
      id: 'pay-local-1',
      dispatch_request_id: DISPATCH_ID,
      provider_payment_id: null,
      provider_preference_id: 'pref-123',
      amount_minor: 14990,
      currency: 'BRL',
      status: 'pending',
      provider: 'mercadopago',
    }
    vi.restoreAllMocks()
  })

  it('rejects cross-origin requests with 403 and invalid UUIDs with 400', async () => {
    const crossOrigin = await POST({
      request: new Request('https://autamedica.com/api/admin/finance/jordan-reconcile', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
        body: JSON.stringify({ requestId: DISPATCH_ID }),
      }),
      locals: { runtime: { env: {} } },
    } as never)
    expect(crossOrigin.status).toBe(403)

    const badId = await POST({
      request: new Request('https://autamedica.com/api/admin/finance/jordan-reconcile', {
        method: 'POST',
        headers: { origin: 'https://autamedica.com' },
        body: JSON.stringify({ requestId: 'not-a-uuid' }),
      }),
      locals: { runtime: { env: {} } },
    } as never)
    expect(badId.status).toBe(400)
  })

  it('rejects non-JORDAN partners with 400 and missing checkout preference with 409', async () => {
    partnerRow = { code: 'OTHER_PARTNER' }
    const nonJordan = await POST({
      request: new Request('https://autamedica.com/api/admin/finance/jordan-reconcile', {
        method: 'POST',
        headers: { origin: 'https://autamedica.com' },
        body: JSON.stringify({ requestId: DISPATCH_ID }),
      }),
      locals: { runtime: { env: { MERCADOPAGO_ACCESS_TOKEN: 'mp-token' } } },
    } as never)
    expect(nonJordan.status).toBe(400)

    partnerRow = { code: 'JORDAN' }
    localPaymentRow = { ...localPaymentRow!, provider_preference_id: null }
    const noPref = await POST({
      request: new Request('https://autamedica.com/api/admin/finance/jordan-reconcile', {
        method: 'POST',
        headers: { origin: 'https://autamedica.com' },
        body: JSON.stringify({ requestId: DISPATCH_ID }),
      }),
      locals: { runtime: { env: { MERCADOPAGO_ACCESS_TOKEN: 'mp-token' } } },
    } as never)
    expect(noPref.status).toBe(409)
  })

  it('returns 409 manual review when Mercado Pago returns multiple matching charges for the same dispatch', async () => {
    const matchingCharge = (id: number) => ({
      id,
      status: 'approved',
      transaction_amount: 149.9,
      currency_id: 'BRL',
      external_reference: `pharm:${DISPATCH_ID}`,
      date_approved: '2026-11-19T12:00:00Z',
      metadata: {
        payment_type: 'pharmacy_consultation',
        dispatch_id: DISPATCH_ID,
      },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [matchingCharge(101), matchingCharge(102)] }), { status: 200 }),
    )

    const res = await POST({
      request: new Request('https://autamedica.com/api/admin/finance/jordan-reconcile', {
        method: 'POST',
        headers: { origin: 'https://autamedica.com' },
        body: JSON.stringify({ requestId: DISPATCH_ID }),
      }),
      locals: { runtime: { env: { MERCADOPAGO_ACCESS_TOKEN: 'mp-token' } } },
    } as never)

    expect(res.status).toBe(409)
  })
})
