import { describe, expect, it } from 'vitest'
import { getMercadoPagoMarketToken, resolveBillingCurrency } from './billing-currency'

describe('resolveBillingCurrency', () => {
  it('resolves BRL from CPF or BR care_country', () => {
    expect(resolveBillingCurrency({ patientCpf: '12345678901' })).toEqual({
      ok: true,
      currency: 'BRL',
    })
    expect(resolveBillingCurrency({ patientCareCountry: 'br' })).toEqual({
      ok: true,
      currency: 'BRL',
    })
  })

  it('resolves ARS from DNI or AR care_country', () => {
    expect(resolveBillingCurrency({ patientDni: '35123456' })).toEqual({
      ok: true,
      currency: 'ARS',
    })
    expect(resolveBillingCurrency({ patientCareCountry: 'AR' })).toEqual({
      ok: true,
      currency: 'ARS',
    })
  })

  it('gives precedence to stored walletCurrency', () => {
    expect(
      resolveBillingCurrency({
        walletCurrency: 'BRL',
        patientCareCountry: 'AR',
      }),
    ).toEqual({
      ok: true,
      currency: 'BRL',
    })
  })

  it('returns billing_currency_conflict on contradictory BR/AR evidence', () => {
    expect(
      resolveBillingCurrency({
        patientCpf: '12345678901',
        patientDni: '35123456',
      }),
    ).toEqual({
      ok: false,
      error: 'billing_currency_conflict',
    })
    expect(
      resolveBillingCurrency({
        patientCareCountry: 'BR',
        patientDni: '35123456',
      }),
    ).toEqual({
      ok: false,
      error: 'billing_currency_conflict',
    })
  })

  it('returns billing_currency_unresolved when no country or document evidence exists', () => {
    expect(resolveBillingCurrency({})).toEqual({
      ok: false,
      error: 'billing_currency_unresolved',
    })
  })
})

describe('getMercadoPagoMarketToken', () => {
  it('selects MERCADOPAGO_ACCESS_TOKEN_BR for BRL and never falls back to generic AR token', () => {
    const brEnv = {
      MERCADOPAGO_ACCESS_TOKEN: 'ar-legacy-token',
      MERCADOPAGO_ACCESS_TOKEN_BR: 'br-token',
    } as Record<string, string>
    expect(getMercadoPagoMarketToken('BRL', (name) => brEnv[name])).toBe('br-token')

    const missingBrEnv = {
      MERCADOPAGO_ACCESS_TOKEN: 'ar-legacy-token',
    } as Record<string, string>
    expect(getMercadoPagoMarketToken('BRL', (name) => missingBrEnv[name])).toBeNull()
  })

  it('uses MERCADOPAGO_ACCESS_TOKEN_AR with legacy fallback only for ARS', () => {
    const arLegacy = { MERCADOPAGO_ACCESS_TOKEN: 'ar-legacy' } as Record<string, string>
    expect(getMercadoPagoMarketToken('ARS', (name) => arLegacy[name])).toBe('ar-legacy')

    const arExplicit = {
      MERCADOPAGO_ACCESS_TOKEN: 'ar-legacy',
      MERCADOPAGO_ACCESS_TOKEN_AR: 'ar-market',
    } as Record<string, string>
    expect(getMercadoPagoMarketToken('ARS', (name) => arExplicit[name])).toBe('ar-market')
  })
})
