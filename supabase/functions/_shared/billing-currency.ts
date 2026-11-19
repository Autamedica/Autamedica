/**
 * Authoritative billing currency selection for AutaMedica's AR and BR markets.
 *
 * Amounts are already expressed in the chosen currency's minor units.
 * This helper NEVER converts or assumes that 1 ARS equals 1 BRL.
 * Do not supply country hints originating solely from a client request,
 * device locale, phone number or unrestricted user metadata.
 */
export type BillingCurrency = 'ARS' | 'BRL'

interface CurrencyEvidence {
  patientCpf?: string | null
  patientDni?: string | null
  doctorBrazilUf?: string | null
  doctorArgentinaRefeps?: string | null
  walletCurrency?: string | null
  patientCareCountry?: string | null
}

export type BillingCurrencyResolution =
  | { ok: true; currency: BillingCurrency }
  | { ok: false; error: 'billing_currency_unresolved' | 'billing_currency_conflict' | 'billing_currency_unsupported' }

export function resolveBillingCurrency(evidence: CurrencyEvidence): BillingCurrencyResolution {
  const cpf = evidence.patientCpf?.trim() || ''
  const dni = evidence.patientDni?.trim() || ''
  const brDoctor = evidence.doctorBrazilUf?.trim() || ''
  const arDoctor = evidence.doctorArgentinaRefeps?.trim() || ''
  const wallet = evidence.walletCurrency?.trim().toUpperCase() || ''

  // The stored wallet currency is authoritative for existing ledger balances.
  // Never reinterpret or convert a historical wallet because care_country changed.
  if (wallet) {
    if (wallet !== 'BRL' && wallet !== 'ARS') return { ok: false, error: 'billing_currency_unsupported' }
    return { ok: true, currency: wallet as BillingCurrency }
  }

  const careCountry = evidence.patientCareCountry?.trim().toUpperCase() || ''
  if (careCountry && careCountry !== 'BR' && careCountry !== 'AR') {
    return { ok: false, error: 'billing_currency_unsupported' }
  }
  if ((cpf && dni) || (brDoctor && arDoctor)) {
    return { ok: false, error: 'billing_currency_conflict' }
  }

  const evidenceCurrencies: BillingCurrency[] = []
  if (careCountry) evidenceCurrencies.push(careCountry === 'BR' ? 'BRL' : 'ARS')
  if (cpf || brDoctor) evidenceCurrencies.push('BRL')
  if (dni || arDoctor) evidenceCurrencies.push('ARS')
  const unique = new Set(evidenceCurrencies)
  if (unique.size > 1) return { ok: false, error: 'billing_currency_conflict' }
  if (unique.size === 0) return { ok: false, error: 'billing_currency_unresolved' }
  return { ok: true, currency: evidenceCurrencies[0] }
}
