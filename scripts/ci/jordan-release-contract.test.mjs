// Non-clinical, offline source-contract checks for the gated Jordan candidate.
// Static contracts are not DB migration replay, PSP verification or on-device QA.
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = (path) => readFileSync(path, 'utf8')
const quote = source('supabase/migrations/20261108091000_jordan_br_dispatch_exact_79_40.sql')
const firstContact = source('supabase/migrations/20261108092000_jordan_first_contact_commission_guard.sql')
const brazilOnly = source('supabase/migrations/20261105001545_guard_jordan_br_only_referrals.sql')
const api = source('apps/web/src/pages/api/pharmacy/dispatch/request.ts')
const checkout = source('apps/web/src/pages/api/pharmacy/dispatch/payment/create.ts')
const media = source('apps/web/src/lib/pharmacy/payments/jordan-media-access.ts')
const pricing = source('apps/web/src/lib/pharmacy/payments/referral-finance.ts')
const cf = source('packages/telemedicine/src/server/cloudflare-calls-handler.ts')
const wrangler = source('apps/web/wrangler.toml')

test('Jordan tariff is BR general only, with separate patient and doctor amounts', () => {
  assert.match(quote, /NEW\.care_country IS DISTINCT FROM 'BR'/)
  assert.match(quote, /NEW\.tier_requested::text <> 'general'/)
  assert.match(quote, /NEW\.price_brl := 79\.00/)
  assert.match(quote, /NEW\.doctor_fee_brl := 40\.00/)
  assert.match(quote, /WHEN v_is_jordan THEN 40\.00/)
  assert.match(quote, /CREATE TRIGGER trg_set_jordan_br_dispatch_quote/)
  assert.match(quote, /BEFORE INSERT ON public\.pharmacy_dispatch_requests/)
  assert.match(quote, /ELSE 69\.90/) // ordinary price must not be repriced
})

test('Jordan is blocked outside BR at both dispatch intake and database', () => {
  assert.match(api, /referralCode === 'JORDAN'/)
  assert.match(api, /careCountry !== 'BR'/)
  assert.match(api, /jordan_checkout_not_ready/)
  assert.match(brazilOnly, /NEW\.care_country IS DISTINCT FROM 'BR'/)
  assert.match(brazilOnly, /CREATE TRIGGER zz_jordan_br_referral/)
})

test('checkout and video gates require server-side verification', () => {
  assert.match(checkout, /ENABLE_JORDAN_PAYMENTS/)
  assert.match(media, /approved/)
  assert.match(media, /GENERAL_PHARMACY_BR_PRICE_CENTS/)
  assert.match(pricing, /GENERAL_PHARMACY_BR_PRICE_CENTS\s*=\s*79_?00/)
  assert.match(media, /mercadopago/)
  assert.match(cf, /ALLOWED_CF_PATH/)
  assert.doesNotMatch(wrangler, /^ENABLE_JORDAN_PAYMENTS\s*=\s*["']true["']/m)
})

test('first-contact ledger is provisional, never an identity or payout proof', () => {
  assert.match(firstContact, /pg_advisory_xact_lock/)
  assert.match(firstContact, /v_phone/)
  assert.match(firstContact, /c\.referral_partner_id=v_partner/)
  assert.match(firstContact, /status='reversed'/)
  // This remains an explicit release blocker until verified customer identity exists.
  assert.match(firstContact, /guest phone ownership is not verified/i)
})

test('synthetic SQL smoke fixtures cannot execute without explicit isolated flag', () => {
  for (const file of [
    'supabase/tests/jordan_br_79_40_dispatch_isolated.sql',
    'supabase/tests/jordan_first_contact_commission_isolated.sql',
  ]) {
    const sql = source(file)
    assert.match(sql, /autamedica\.isolated_test/)
    assert.match(sql, /ROLLBACK;/)
  }
})


function countOccurrences(text, fragment) {
  return text.split(fragment).length - 1
}

test('optional verified-person migration has one complete atomic SQL definition', () => {
  const path = 'supabase/migrations/20261108110000_jordan_verified_subject_commissions.sql'
  assert.ok(existsSync(path), 'NO-GO: verified identity gate #728 has not reached this main commit')
  const sql = source(path)
  assert.equal(countOccurrences(sql, '\nBEGIN;'), 1)
  assert.equal(countOccurrences(sql, '\nCOMMIT;'), 1)
  for (const name of [
    'CREATE OR REPLACE FUNCTION app_private.try_credit_verified_jordan(',
    'CREATE OR REPLACE FUNCTION app_private.guard_jordan_verified_commission()',
    'CREATE OR REPLACE FUNCTION public.sync_pharmacy_referral_commission()',
  ]) {
    assert.equal(countOccurrences(sql, name), 1, `SQL duplicate: ${name}`)
  }
  assert.match(sql, /trg_guard_jordan_verified_commission/)
  assert.match(sql, /jordan_verified_payment_and_subject_required/)
  assert.match(sql, /reversed_commission_is_terminal/)
  // A ledger UPDATE to eligible must check verified identity + PSP again.
  assert.match(sql, /TG_OP='INSERT' OR NEW\.status='eligible'/)
  assert.match(sql, /pay\.status='approved'/)
  assert.match(sql, /pay\.provider='mercadopago'/)
  assert.match(sql, /pay\.amount_minor=7900/)
  assert.ok(sql.includes("pay.provider_payment_id ~ '^[0-9]{1,20}$'"))
  const smoke = source('supabase/tests/jordan_first_contact_commission_isolated.sql')
  assert.match(smoke, /Wrong R\$81 amount incorrectly awarded Jordan commission/)
  assert.match(smoke, /Forged provider ID incorrectly awarded commission/)
  assert.match(sql, /CHECK \(verified_subject_hash IS NULL/)
  assert.doesNotMatch(sql, /COMMIT;\s*\);/)
})

test('optional session binding migration is service-only and RLS enabled', () => {
  const path = 'supabase/migrations/20261108120000_sfu_room_session_bindings.sql'
  assert.ok(existsSync(path), 'NO-GO: SFU session-room binding gate #729 has not reached this main commit')
  const sql = source(path)
  assert.equal(countOccurrences(sql, '\nBEGIN;'), 1)
  assert.equal(countOccurrences(sql, '\nCOMMIT;'), 1)
  assert.match(sql, /sfu_room_session_bindings ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.sfu_room_session_bindings FROM PUBLIC,anon,authenticated/)
  assert.match(sql, /GRANT SELECT,INSERT ON public\.sfu_room_session_bindings TO service_role/)
})
