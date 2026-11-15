import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkJordanMediaAccess } from './jordan-media-access'

const jordan = { code: 'JORDAN', active: true }
const brDispatch = {
  id: 'dispatch-br', care_country: 'BR', tier_requested: 'general',
  referral_partner_id: 'jordan-id', commercial_referral_partners: jordan,
}
const arDispatch = {
  id: 'dispatch-ar', care_country: 'AR', tier_requested: 'general',
  referral_partner_id: 'jordan-id', commercial_referral_partners: jordan,
}
const brTariff = { currency: 'BRL', consultation_price_minor: 7900, require_payment_before_dispatch: true }
const arTariff = { currency: 'ARS', consultation_price_minor: 1500000, require_payment_before_dispatch: true }
const brPaid = {
  status: 'approved', provider: 'mercadopago', provider_payment_id: '123456789',
  paid_at: '2026-11-08T10:00:00Z', amount_minor: 7900, currency: 'BRL', metadata: {},
}
const arPaid = {
  status: 'approved', provider: 'mercadopago', provider_payment_id: '987654321',
  paid_at: '2026-11-08T10:00:00Z', amount_minor: 1500000, currency: 'ARS', metadata: {},
}

function client(
  row: Record<string, unknown> | null,
  payment: Record<string, unknown> | null = null,
  options: {
    partner?: Record<string, unknown> | null
    tariff?: Record<string, unknown> | null
    errors?: string[]
  } = {},
) {
  const from = vi.fn((table: string) => {
    const data = table === 'pharmacy_dispatch_requests' ? row
      : table === 'commercial_referral_partners' ? (options.partner === undefined ? row?.commercial_referral_partners ?? null : options.partner)
      : table === 'pharmacy_dispatch_pricing_configs' ? (options.tariff ?? (row?.care_country === 'AR' ? arTariff : brTariff))
      : table === 'pharmacy_dispatch_payments' ? payment : null
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data,
        error: options.errors?.includes(table) ? new Error('database_unavailable') : null,
      }),
    }
    return chain
  })
  return { admin: { from } as unknown as SupabaseClient, from }
}

describe('Country-scoped pharmacy media gate', () => {
  it('leaves ordinary non-pharmacy calls untouched', async () => {
    const absent = client(null)
    expect(await checkJordanMediaAccess(absent.admin, 'ordinary-room')).toBe('allowed')
    expect(absent.from).toHaveBeenCalledTimes(1)
  })

  it('requires a tariff-matched payment for direct pharmacy requests in both countries', async () => {
    const directBr = { ...brDispatch, referral_partner_id: null, commercial_referral_partners: null }
    const directAr = { ...arDispatch, referral_partner_id: null, commercial_referral_partners: null }
    expect(await checkJordanMediaAccess(client(directBr).admin, 'direct-br')).toBe('payment_required')
    expect(await checkJordanMediaAccess(client(directBr, brPaid).admin, 'direct-br-paid')).toBe('allowed')
    expect(await checkJordanMediaAccess(client(directAr).admin, 'direct-ar')).toBe('payment_required')
    expect(await checkJordanMediaAccess(client(directAr, arPaid).admin, 'direct-ar-paid')).toBe('allowed')
    expect(await checkJordanMediaAccess(client(directAr, { ...arPaid, currency: 'BRL' }).admin, 'direct-ar-wrong-currency')).toBe('payment_required')
    expect(await checkJordanMediaAccess(client(directAr, { ...arPaid, amount_minor: 7900 }).admin, 'direct-ar-wrong-amount')).toBe('payment_required')
  })

  it('accepts a paid Jordan referral in ARS and BRL only for general consultations', async () => {
    expect(await checkJordanMediaAccess(client(brDispatch, brPaid).admin, 'jordan-br')).toBe('allowed')
    expect(await checkJordanMediaAccess(client(arDispatch, arPaid).admin, 'jordan-ar')).toBe('allowed')
    expect(await checkJordanMediaAccess(client({ ...arDispatch, tier_requested: 'cardiologia' }, arPaid).admin, 'jordan-ar-specialist')).toBe('payment_required')
    expect(await checkJordanMediaAccess(client(arDispatch, { ...arPaid, status: 'pending' }).admin, 'jordan-ar-pending')).toBe('payment_required')
  })

  it('accepts only an audited manual override with the exact country quote', async () => {
    const manualAr = {
      ...arPaid,
      provider_payment_id: 'MANUAL_OVERRIDE_00000000-0000-4000-8000-000000000001',
      metadata: { manual_override_by: '00000000-0000-4000-8000-000000000002' },
    }
    expect(await checkJordanMediaAccess(client(arDispatch, manualAr).admin, 'ar-manual')).toBe('allowed')
    expect(await checkJordanMediaAccess(client(arDispatch, {
      ...manualAr, metadata: {},
    }).admin, 'ar-manual-without-actor')).toBe('payment_required')
  })

  it('honors a tariff configured without payment-first and fails closed on database errors', async () => {
    expect(await checkJordanMediaAccess(client(arDispatch, null, {
      tariff: { ...arTariff, require_payment_before_dispatch: false },
    }).admin, 'ar-no-payment-first')).toBe('allowed')
    await expect(checkJordanMediaAccess(client(arDispatch, arPaid, { errors: ['pharmacy_dispatch_requests'] }).admin, 'dispatch-error')).rejects.toThrow()
    await expect(checkJordanMediaAccess(client(arDispatch, arPaid, { errors: ['pharmacy_dispatch_pricing_configs'] }).admin, 'tariff-error')).rejects.toThrow()
    await expect(checkJordanMediaAccess(client(arDispatch, arPaid, { errors: ['pharmacy_dispatch_payments'] }).admin, 'payment-error')).rejects.toThrow()
  })
})
