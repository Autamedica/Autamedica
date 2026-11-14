// Offline source-contract checks for the BR pharmacy express release.
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = (path) => readFileSync(path, 'utf8')
const migrationPath = 'supabase/migrations/20261114133923_jordan_br_payment_first_acquisition_and_commission_payout.sql'
const migration = source(migrationPath)
const refundMigration = source('supabase/migrations/20261114140936_jordan_reverse_paid_commission_on_refund.sql')
const request = source('apps/web/src/pages/api/pharmacy/dispatch/request.ts')
const checkout = source('apps/web/src/pages/api/pharmacy/dispatch/payment/create.ts')
const widget = source('apps/web/src/components/pharmacy/JordanPaymentWidget.tsx')
const consultation = source('apps/web/src/components/pharmacy/PharmacyExpressConsultation.tsx')
const media = source('apps/web/src/lib/pharmacy/payments/jordan-media-access.ts')
const edge = source('supabase/functions/cloudflare-calls/index.ts')
const eligibility = source('apps/web/src/lib/pharmacy/payments/jordan-commission-eligibility.ts')
const financeApi = source('apps/web/src/pages/api/admin/finance/pharmacy-payments.ts')
const financeUi = source('apps/web/src/components/admin/FinanceAdminDashboard.tsx')

test('every Brazil express request receives the same R$79/R$40 quote', () => {
  assert.match(migration, /IF NEW\.care_country='BR' THEN/)
  assert.match(migration, /NEW\.price_brl:=79\.00/)
  assert.match(migration, /NEW\.doctor_fee_brl:=40\.00/)
  assert.match(checkout, /GENERAL_PHARMACY_BR_PRICE_CENTS/)
  assert.match(checkout, /JORDAN_DOCTOR_FEE_CENTS/)
})

test('direct BR and Jordan QR requests both require approved R$79 checkout before matching', () => {
  assert.match(request, /careCountry === 'BR'/)
  assert.match(request, /hasSecureGuestPaymentSecret/)
  assert.match(checkout, /pharmacy_express_payments_enabled/)
  assert.match(checkout, /jordan_qr_payments_enabled/)
  assert.match(migration, /BRAZIL_PAYMENT_REQUIRED/)
  assert.match(migration, /pay\.status='approved'/)
  assert.match(migration, /pay\.amount_minor=7900/)
  assert.match(migration, /pay\.currency='BRL'/)
})

test('guest UI exposes checkout for every BR dispatch and blocks video until approval', () => {
  assert.match(consultation, /brazilPaymentApproved/)
  assert.match(consultation, /formData\.careCountry === 'BR' && requestId && accessToken/)
  assert.match(widget, /sourceLabel/)
  assert.match(widget, /onStatusChange\?\.\(res\.status\)/)
})

test('all server-side media paths recheck the approved BR payment ledger', () => {
  assert.match(media, /dispatch\.care_country !== 'BR'/)
  assert.match(media, /payment\?\.status === 'approved'/)
  assert.match(media, /GENERAL_PHARMACY_BR_PRICE_CENTS/)
  assert.match(edge, /mediaDispatch\?\.care_country === 'BR'/)
  assert.match(edge, /brazil_pharmacy_payment_required/)
})

test('Jordan commission is first acquisition by normalized phone OR CPF, no KYC dependency', () => {
  assert.match(migration, /patient_phone/)
  assert.match(migration, /patient_cpf/)
  assert.match(migration, /pp\.status IN \('approved','refunded'\)/)
  assert.match(migration, /dispatch_payment_id,referral_partner_id/)
  assert.match(refundMigration, /status IN \('eligible','paid'\)/)
  assert.match(eligibility, /amount_minor === 1000/)
  assert.match(eligibility, /currency === 'BRL'/)
  assert.doesNotMatch(migration, /verified_subject_hash|commercial_referral_identity_proofs/)
  assert.equal(existsSync('supabase/migrations/20261108110000_jordan_verified_subject_commissions.sql'), false)
})

test('admin can settle only eligible commissions with a transfer reference', () => {
  assert.match(financeApi, /payment_reference/)
  assert.match(financeApi, /\.eq\('status', 'eligible'\)/)
  assert.match(financeUi, /ReferralCommissionPayouts/)
  assert.match(financeUi, /Marcar pagada/)
})

test('isolated DB tests cover the payment and first-acquisition rules without identity proofs', () => {
  const referralTest = source('supabase/tests/pharmacy_referral_commission_isolated.sql')
  const dispatchTest = source('supabase/tests/jordan_br_79_40_dispatch_isolated.sql')
  assert.match(referralTest, /repeat phone received a Jordan commission/)
  assert.match(referralTest, /repeat CPF received a Jordan commission/)
  assert.match(referralTest, /refund failed to reverse commission/)
  assert.match(dispatchTest, /BRAZIL_PAYMENT_REQUIRED/)
  assert.doesNotMatch(referralTest + dispatchTest, /commercial_referral_identity_proofs|verified_subject_hash/)
})
