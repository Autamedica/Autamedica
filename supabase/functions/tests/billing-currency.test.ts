import { assertEquals } from '@std/assert'
import { resolveBillingCurrency } from '../_shared/billing-currency.ts'

Deno.test('billing currency BRL: verified CPF and Brazilian physician', () => {
  assertEquals(resolveBillingCurrency({
    patientCpf: '12345678901', doctorBrazilUf: 'RS', walletCurrency: 'BRL',
  }), { ok: true, currency: 'BRL' })
})

Deno.test('billing currency ARS: verified DNI and Argentine physician', () => {
  assertEquals(resolveBillingCurrency({
    patientDni: '30123456', doctorArgentinaRefeps: 'REFEPS-123', walletCurrency: 'ARS',
  }), { ok: true, currency: 'ARS' })
})

Deno.test('legacy Argentine wallet retains ARS when no identity metadata exists', () => {
  assertEquals(resolveBillingCurrency({ walletCurrency: 'ARS' }), { ok: true, currency: 'ARS' })
})

Deno.test('Brazilian doctor can establish BRL when patient has no wallet', () => {
  assertEquals(resolveBillingCurrency({ doctorBrazilUf: 'SP' }), { ok: true, currency: 'BRL' })
})

Deno.test('conflicting CPF and existing ARS wallet fail closed, without conversion', () => {
  assertEquals(resolveBillingCurrency({
    patientCpf: '12345678901', walletCurrency: 'ARS',
  }), { ok: false, error: 'billing_currency_conflict' })
})

Deno.test('different patient and doctor jurisdictions require review', () => {
  assertEquals(resolveBillingCurrency({
    patientDni: '30123456', doctorBrazilUf: 'RS',
  }), { ok: false, error: 'billing_currency_conflict' })
})

Deno.test('missing jurisdiction and wallet does not default to any currency', () => {
  assertEquals(resolveBillingCurrency({}), { ok: false, error: 'billing_currency_unresolved' })
})

Deno.test('unsupported wallet currency is rejected', () => {
  assertEquals(resolveBillingCurrency({ walletCurrency: 'USD' }),
    { ok: false, error: 'billing_currency_unsupported' })
})
