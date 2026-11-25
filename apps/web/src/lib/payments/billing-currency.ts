/**
 * Authoritative billing currency & market credential resolution for AR/BR.
 * Matches supabase/functions/_shared/billing-currency.ts and mercadopago-market-token.ts.
 * Never converts or assumes 1 ARS equals 1 BRL, and never falls back to ARS.
 */

export type BillingCurrency = 'ARS' | 'BRL'

export interface WalletCurrencyEvidence {
  patientCpf?: string | null
  patientDni?: string | null
  patientCareCountry?: string | null
  walletCurrency?: string | null
}

export type BillingCurrencyResolution =
  | { ok: true; currency: BillingCurrency }
  | {
      ok: false
      error: 'billing_currency_unresolved' | 'billing_currency_conflict' | 'billing_currency_unsupported'
    }

export function resolveBillingCurrency(evidence: WalletCurrencyEvidence): BillingCurrencyResolution {
  const wallet = evidence.walletCurrency?.trim().toUpperCase() || ''
  if (wallet) {
    if (wallet !== 'BRL' && wallet !== 'ARS') {
      return { ok: false, error: 'billing_currency_unsupported' }
    }
    return { ok: true, currency: wallet }
  }

  const cpf = evidence.patientCpf?.trim() || ''
  const dni = evidence.patientDni?.trim() || ''
  const careCountry = evidence.patientCareCountry?.trim().toUpperCase() || ''

  if (careCountry && careCountry !== 'BR' && careCountry !== 'AR') {
    return { ok: false, error: 'billing_currency_unsupported' }
  }
  if (cpf && dni) {
    return { ok: false, error: 'billing_currency_conflict' }
  }

  const resolvedCandidates = new Set<BillingCurrency>()
  if (careCountry === 'BR' || cpf) resolvedCandidates.add('BRL')
  if (careCountry === 'AR' || dni) resolvedCandidates.add('ARS')

  if (resolvedCandidates.size > 1) {
    return { ok: false, error: 'billing_currency_conflict' }
  }
  if (resolvedCandidates.size === 0) {
    return { ok: false, error: 'billing_currency_unresolved' }
  }

  const [currency] = Array.from(resolvedCandidates)
  return { ok: true, currency }
}

export function getMercadoPagoMarketToken(
  currency: BillingCurrency,
  getSecret: (name: string) => string | undefined,
): string | null {
  const envKey = currency === 'BRL' ? 'MERCADOPAGO_ACCESS_TOKEN_BR' : 'MERCADOPAGO_ACCESS_TOKEN_AR'
  const regional = getSecret(envKey)?.trim()
  if (regional) return regional

  // Legacy single-merchant token belongs strictly to Argentina (ARS); never use it for BRL.
  return currency === 'ARS' ? getSecret('MERCADOPAGO_ACCESS_TOKEN')?.trim() || null : null
}
