import { assertEquals } from '@std/assert'
import { handler } from '../mobile-payments-webhook/index.ts'
import { paymentAmountCents, verifyMercadoPagoMarketSignature } from '../_shared/mercadopago-webhook-verify.ts'

async function signedRequest(
  market: 'BR' | 'AR',
  paymentId: string,
  secret = 'webhook-test-secret',
): Promise<Request> {
  const ts = '1730000000'
  const requestId = 'a-provider-request'
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)))
  const signature = Array.from(signatureBytes, (x) => x.toString(16).padStart(2, '0')).join('')
  return new Request(`http://localhost/mobile-payments-webhook?market=${market}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` },
    body: JSON.stringify({ type: 'payment', data: { id: paymentId } }),
  })
}

Deno.test('MP HMAC validates signed provider id, blocks modified callback and rounding errors', async () => {
  const request = await signedRequest('BR', '99112')
  assertEquals(await verifyMercadoPagoMarketSignature({
    signature: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    paymentId: '99112', secret: 'webhook-test-secret',
  }), true)
  assertEquals(await verifyMercadoPagoMarketSignature({
    signature: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    paymentId: '99113', secret: 'webhook-test-secret',
  }), false)
  assertEquals(paymentAmountCents(79), 7900)
  assertEquals(paymentAmountCents(79.005), null)
})

Deno.test('mobile payment webhook rejects unsigned notifications', async () => {
  Deno.env.set('MERCADOPAGO_WEBHOOK_SECRET_BR', 'webhook-test-secret')
  const request = new Request('http://localhost/mobile-payments-webhook?market=BR', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'payment', data: { id: '99112' } }),
  })
  const response = await handler(request)
  assertEquals(response.status, 401)
})

Deno.test('BRL wallet topup is credited only after HMAC and Mercado Pago confirmation', async () => {
  Deno.env.set('MERCADOPAGO_WEBHOOK_SECRET_BR', 'webhook-test-secret')
  Deno.env.set('MERCADOPAGO_ACCESS_TOKEN_BR', 'br-merchant-token')
  Deno.env.set('SUPABASE_URL', 'https://dummy.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'dummy-service')
  let credited = false
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('api.mercadopago.com/v1/payments/99112')) {
      assertEquals(new Headers(init?.headers).get('Authorization'), 'Bearer br-merchant-token')
      return Response.json({
        id: 99112, status: 'approved', currency_id: 'BRL', transaction_amount: 50,
        metadata: { type: 'wallet_topup', patient_id: 'patient-br-1', amount_cents: 5000, currency: 'BRL' },
      })
    }
    if (url.includes('/rest/v1/patient_wallets')) return Response.json({ currency: 'BRL' })
    if (url.includes('/rest/v1/rpc/grant_patient_wallet_credit')) {
      credited = true
      const body = JSON.parse(String(init?.body))
      assertEquals(body.p_idempotency_key, 'wallet_topup:99112')
      assertEquals(body.p_amount_cents, 5000)
      return Response.json([{ success: true, ledger_id: 'ledger-123', new_available_credit_cents: 5000 }])
    }
    return previousFetch(input, init)
  }
  try {
    const response = await handler(await signedRequest('BR', '99112'))
    assertEquals(response.status, 200)
    assertEquals(credited, true)
  } finally { globalThis.fetch = previousFetch }
})

Deno.test('ARS appointment payment confirms matched amount and currency only', async () => {
  Deno.env.set('MERCADOPAGO_WEBHOOK_SECRET_AR', 'webhook-test-secret')
  Deno.env.set('MERCADOPAGO_ACCESS_TOKEN_AR', 'ar-merchant-token')
  Deno.env.set('SUPABASE_URL', 'https://dummy.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'dummy-service')
  let savedPayment = false
  let confirmedAppointment = false
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    if (url.includes('api.mercadopago.com/v1/payments/99113')) {
      assertEquals(new Headers(init?.headers).get('Authorization'), 'Bearer ar-merchant-token')
      return Response.json({
        id: 99113, status: 'approved', currency_id: 'ARS', transaction_amount: 119,
        external_reference: 'apt-1',
        metadata: { appointment_id: 'apt-1', patient_id: 'patient-ar-1', doctor_id: 'dr-ar-1' },
      })
    }
    if (url.includes('/rest/v1/appointment_payments')) {
      if (method === 'PATCH') {
        savedPayment = true
        return Response.json([{ id: 'payment-row' }])
      }
      return Response.json({
        id: 'payment-row', appointment_id: 'apt-1', patient_id: 'patient-ar-1', doctor_id: 'dr-ar-1',
        gross_amount: 11900, currency: 'ARS', provider: 'mercadopago', status: 'pending', provider_payment_id: null,
      })
    }
    if (url.includes('/rest/v1/appointments')) {
      if (method === 'PATCH') {
        confirmedAppointment = true
        return Response.json([{ id: 'apt-1' }])
      }
      return Response.json({ id: 'apt-1', patient_id: 'patient-ar-1', doctor_id: 'dr-ar-1', status: 'payment_pending' })
    }
    return previousFetch(input, init)
  }
  try {
    const response = await handler(await signedRequest('AR', '99113'))
    assertEquals(response.status, 200)
    assertEquals(savedPayment, true)
    assertEquals(confirmedAppointment, true)
  } finally { globalThis.fetch = previousFetch }
})

Deno.test('provider currency mismatch cannot confirm payment', async () => {
  Deno.env.set('MERCADOPAGO_WEBHOOK_SECRET_BR', 'webhook-test-secret')
  Deno.env.set('MERCADOPAGO_ACCESS_TOKEN_BR', 'br-merchant-token')
  Deno.env.set('SUPABASE_URL', 'https://dummy.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'dummy-service')
  const oldFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('api.mercadopago.com/v1/payments/99114')) {
      return Response.json({ id: 99114, status: 'approved', currency_id: 'ARS', transaction_amount: 50 })
    }
    return oldFetch(input, init)
  }
  try {
    const response = await handler(await signedRequest('BR', '99114'))
    assertEquals(response.status, 409)
  } finally { globalThis.fetch = oldFetch }
})
