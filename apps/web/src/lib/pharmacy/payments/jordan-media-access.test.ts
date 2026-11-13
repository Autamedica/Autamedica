import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkJordanMediaAccess } from './jordan-media-access'

const jordan = { code: 'JORDAN', active: true }
const dispatch = {
  id: 'dispatch-br',
  care_country: 'BR',
  referral_partner_id: 'jordan-id',
  commercial_referral_partners: jordan,
}
const paid = {
  status: 'approved',
  provider: 'mercadopago',
  provider_payment_id: '123456789',
  paid_at: '2026-11-08T10:00:00Z',
  amount_minor: 7900,
  currency: 'BRL',
}

function client(
  row: Record<string, unknown> | null,
  payment: Record<string, unknown> | null = null,
  errors: { dispatch?: boolean; payment?: boolean } = {},
) {
  const from = vi.fn((table: string) => {
    const failing = table === 'pharmacy_dispatch_requests'
      ? errors.dispatch : errors.payment
    const data = table === 'pharmacy_dispatch_requests' ? row : payment
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data,
        error: failing ? new Error('database_unavailable') : null,
      }),
    }
    return chain
  })
  return { admin: { from } as unknown as SupabaseClient, from }
}

describe('Jordan server media gate', () => {
  it('leaves ordinary calls untouched', async () => {
    const absent = client(null)
    expect(await checkJordanMediaAccess(absent.admin, 'ordinary-room')).toBe('allowed')
    expect(absent.from).toHaveBeenCalledTimes(1)
    expect(await checkJordanMediaAccess(client({ ...dispatch, referral_partner_id: null, commercial_referral_partners: null }).admin, 'br')).toBe('allowed')
    expect(await checkJordanMediaAccess(client({ ...dispatch, commercial_referral_partners: { code: 'OTHER', active: true } }).admin, 'other')).toBe('allowed')
  })

  it('blocks Jordan without a reconciled approval', async () => {
    for (const payment of [null, { ...paid, status: 'pending' }, { ...paid, status: 'refunded' },
      { ...paid, currency: 'ARS' }, { ...paid, amount_minor: 7800 },
      { ...paid, provider_payment_id: null }, { ...paid, paid_at: null },
      { ...paid, provider: 'other' }]) {
      expect(await checkJordanMediaAccess(client(dispatch, payment).admin, 'jordan-room')).toBe('payment_required')
    }
  })

  it('accepts only a complete BRL provider-approved ledger record', async () => {
    expect(await checkJordanMediaAccess(client(dispatch, paid).admin, 'jordan-room')).toBe('allowed')
  })

  it('blocks Jordan with Argentine jurisdiction or inactive partner', async () => {
    expect(await checkJordanMediaAccess(client({ ...dispatch, care_country: 'AR' }, paid).admin, 'ar-room')).toBe('payment_required')
    expect(await checkJordanMediaAccess(client({ ...dispatch, commercial_referral_partners: { code: 'JORDAN', active: false } }, paid).admin, 'inactive-room')).toBe('payment_required')
  })

  it('fails closed on a missing partner or database error', async () => {
    await expect(checkJordanMediaAccess(client({ ...dispatch, commercial_referral_partners: null }).admin, 'bad')).rejects.toThrow()
    await expect(checkJordanMediaAccess(client(dispatch, paid, { dispatch: true }).admin, 'bad')).rejects.toThrow()
    await expect(checkJordanMediaAccess(client(dispatch, paid, { payment: true }).admin, 'bad')).rejects.toThrow()
  })
})
