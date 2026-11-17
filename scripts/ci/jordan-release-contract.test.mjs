// Offline source-contract checks for the country-scoped pharmacy release.
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = (path) => readFileSync(path, 'utf8')
const migration = source('supabase/migrations/20261115110000_country_aware_pharmacy_pricing.sql')
const manualGuard = source('supabase/migrations/20261115123000_allow_audited_manual_pharmacy_payment_override.sql')
const manualProvider = source('supabase/migrations/20261115133000_enable_manual_pharmacy_payment_provider.sql')
const request = source('apps/web/src/pages/api/pharmacy/dispatch/request.ts')
const checkout = source('apps/web/src/pages/api/pharmacy/dispatch/payment/create.ts')
const widget = source('apps/web/src/components/pharmacy/JordanPaymentWidget.tsx')
const consultation = source('apps/web/src/components/pharmacy/PharmacyExpressConsultation.tsx')
const media = source('apps/web/src/lib/pharmacy/payments/jordan-media-access.ts')
const edge = source('supabase/functions/cloudflare-calls/index.ts')
const eligibility = source('apps/web/src/lib/pharmacy/payments/jordan-commission-eligibility.ts')
const governance = source('apps/web/src/components/admin/OperationalGovernanceCenter.tsx')
const pricingApi = source('apps/web/src/pages/api/admin/governance/pharmacy-pricing.ts')
const commissionTest = source('supabase/tests/pharmacy_referral_commission_isolated.sql')
const dispatchTest = source('supabase/tests/jordan_br_79_40_dispatch_isolated.sql')

test('country tariff seeds BRL and ARS with auditable, payment-first pricing', () => {
  assert.match(migration, /'BR','BRL',7900,4000,1000,true/)
  assert.match(migration, /'AR','ARS',1500000,800000,200000,true/)
  for (const column of ['country_code','currency','consultation_price_minor','doctor_fee_minor',
    'partner_commission_minor','require_payment_before_dispatch','updated_by','updated_at','change_reason']) {
    assert.match(migration, new RegExp(column))
  }
  assert.match(migration, /pharmacy_dispatch_pricing_updated/)
  assert.match(migration, /admin_upsert_pharmacy_dispatch_pricing_config/)
})

test('request intake and checkout use the configured country quote, currency and payment scopes', () => {
  assert.match(request, /pharmacy_dispatch_pricing_configs/)
  assert.match(request, /careCountry === 'BR' && lgpdConsent !== true/)
  assert.doesNotMatch(request, /jordan_referral_brazil_only/)
  assert.match(checkout, /pharmacy_dispatch_pricing_configs/)
  assert.match(checkout, /consultation_price_minor/)
  assert.match(checkout, /currency_id: currency/)
  assert.match(checkout, /MERCADOPAGO_ACCESS_TOKEN_AR/)
  assert.match(checkout, /manualPilot/)
  assert.match(checkout, /manualApprovalRequired/)
  assert.match(checkout, /!manualPilot && !operationalSwitches\.global_pix_mp_payments_enabled/)
  assert.match(manualProvider, /provider IN \('mercadopago','manual'\)/)
  assert.match(migration, /COUNTRY_PAYMENT_REQUIRED/)
  assert.match(migration, /v_config\.currency/)
  assert.match(migration, /v_config\.consultation_price_minor/)
})

test('Jordan is available for general consultations in either configured country', () => {
  assert.match(migration, /v_partner_code='JORDAN' AND \(NEW\.care_country NOT IN \('AR','BR'\)/)
  assert.match(request, /Jordan supports both BR and AR general-consultation channels/)
  assert.doesNotMatch(edge, /Jordan is limited to Brazil/)
  assert.match(consultation, /pricingByCountry/)
  assert.match(consultation, /countryPaymentApproved/)
  assert.match(widget, /currency\?: 'BRL' \| 'ARS'/)
  assert.match(widget, /amountMinor\?: number/)
})

test('both web and Edge media gates require tariff-matched provider or audited manual evidence', () => {
  assert.match(media, /pharmacy_dispatch_pricing_configs/)
  assert.match(media, /MANUAL_OVERRIDE_/)
  assert.match(edge, /pharmacy_dispatch_pricing_configs/)
  assert.match(edge, /MANUAL_OVERRIDE_/)
  assert.match(edge, /isPaidPharmacyDispatch/)
  assert.match(migration, /manual_override_by/)
  assert.match(manualGuard, /MANUAL_OVERRIDE_/)
  assert.match(manualGuard, /manual_override_at/)
  assert.match(manualGuard, /manual_override_reason/)
  assert.match(manualGuard, /manual_override_evidence_reference/)
  assert.match(manualGuard, /pharmacy_payment_identity_immutable/)
})

test('referral commission recognition accepts both configured settlement currencies', () => {
  assert.match(eligibility, /commission\.currency === 'BRL' \|\| commission\.currency === 'ARS'/)
  assert.match(migration, /partner_commission_minor/)
  assert.match(commissionTest, /amount_minor=200000/)
  assert.match(commissionTest, /currency='ARS'/)
  assert.match(dispatchTest, /currency='ARS'/)
})

test('Governance Admin edits BR and AR tariffs through an audited RPC', () => {
  assert.match(governance, /renderPricingEditor/)
  assert.match(governance, /savePricing/)
  assert.match(governance, /pharmacy-pricing/)
  assert.match(pricingApi, /admin_upsert_pharmacy_dispatch_pricing_config/)
  assert.match(pricingApi, /ADMIN_ROLES/)
})
