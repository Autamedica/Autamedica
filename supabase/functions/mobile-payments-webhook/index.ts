import { createClient } from '@supabase/supabase-js'
import type { BillingCurrency } from '../_shared/billing-currency.ts'
import { getMercadoPagoMarketToken } from '../_shared/mercadopago-market-token.ts'
import {
  mercadoPagoMarketSecrets,
  paymentAmountCents,
  verifyMercadoPagoMarketSignature,
} from '../_shared/mercadopago-webhook-verify.ts'

interface MercadoPagoPayment {
  id: number | string
  status: string
  currency_id: string
  transaction_amount: number
  external_reference?: string | null
  date_approved?: string | null
  metadata?: Record<string, unknown>
}

function json(status: number, data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Kotlin-specific Mercado Pago notifications. Never sends a payment to the
 * legacy single-market web callback. Provider HMAC and API lookup are mandatory.
 * Deploy as verify_jwt=false so Mercado Pago can deliver signed notifications.
 */
export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const url = new URL(req.url)
  const market = url.searchParams.get('market')
  if (market !== 'BR' && market !== 'AR') return json(400, { error: 'invalid_market' })
  const currency: BillingCurrency = market === 'BR' ? 'BRL' : 'ARS'

  let payload: { type?: string; topic?: string; action?: string; data?: { id?: string | number } }
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }
  const type = payload.type || payload.topic || url.searchParams.get('type')
  const action = payload.action || ''
  if (type !== 'payment' && !action.startsWith('payment.')) {
    return json(200, { received: true, ignored: 'unrelated_topic' })
  }
  const bodyId = payload.data?.id == null ? null : String(payload.data.id)
  const queryId = url.searchParams.get('data.id')
  if (bodyId && queryId && bodyId !== queryId) return json(400, { error: 'payment_id_conflict' })
  const paymentId = bodyId || queryId || ''
  const secretName = mercadoPagoMarketSecrets(currency).signatureName
  const secret = Deno.env.get(secretName) ?? null
  if (!await verifyMercadoPagoMarketSignature({
    signature: req.headers.get('x-signature'),
    requestId: req.headers.get('x-request-id'),
    paymentId,
    secret,
  })) return json(401, { error: 'invalid_webhook_signature' })

  const token = getMercadoPagoMarketToken(currency)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!token || !supabaseUrl || !serviceKey) return json(503, { error: 'market_not_configured' })

  try {
    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!paymentResponse.ok) return json(502, { error: 'provider_payment_lookup_failed' })
    const payment = await paymentResponse.json() as MercadoPagoPayment
    if (String(payment.id) !== paymentId || payment.currency_id !== currency) {
      return json(409, { error: 'provider_currency_or_id_mismatch' })
    }
    const amountCents = paymentAmountCents(payment.transaction_amount)
    if (amountCents == null) return json(409, { error: 'invalid_payment_amount' })
    const metadata = payment.metadata ?? {}
    if (metadata.currency != null && metadata.currency !== currency) {
      return json(409, { error: 'metadata_currency_mismatch' })
    }
    if (payment.status !== 'approved') return json(200, { received: true, status: payment.status })

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const patientId = typeof metadata.patient_id === 'string' ? metadata.patient_id : null
    if (!patientId) return json(409, { error: 'missing_patient_reference' })

    if (metadata.type === 'wallet_topup') {
      if (!Number.isSafeInteger(Number(metadata.amount_cents)) ||
          Number(metadata.amount_cents) !== amountCents) {
        return json(409, { error: 'topup_amount_mismatch' })
      }
      const { data: wallet, error: walletError } = await db
        .from('patient_wallets').select('currency').eq('patient_id', patientId).maybeSingle()
      if (walletError || !wallet || wallet.currency !== currency) {
        return json(409, { error: 'topup_wallet_currency_mismatch' })
      }
      const { data: creditRows, error } = await db.rpc('grant_patient_wallet_credit', {
        p_patient_id: patientId,
        p_amount_cents: amountCents,
        p_reason: `Mercado Pago confirmed top-up ${paymentId}`,
        p_idempotency_key: `wallet_topup:${paymentId}`,
      })
      const credit = Array.isArray(creditRows) ? creditRows[0] : creditRows
      if (error || !credit?.success || !credit?.ledger_id) {
        console.error('[mobile-payments-webhook] wallet credit was not confirmed:', error)
        return json(503, { error: 'wallet_credit_not_confirmed' })
      }
      return json(200, { received: true, credited: true })
    }

    const appointmentId = typeof metadata.appointment_id === 'string'
      ? metadata.appointment_id : null
    const doctorId = typeof metadata.doctor_id === 'string' ? metadata.doctor_id : null
    if (!appointmentId || !doctorId || payment.external_reference !== appointmentId) {
      return json(409, { error: 'appointment_reference_mismatch' })
    }
    // One service-role RPC locks the appointment and payment, checks their
    // ownership, fee, currency and processor ID, and commits both statuses.
    // A failed confirmation leaves both records unchanged.
    const { data: confirmationRows, error: confirmationError } = await db
      .rpc('confirm_mobile_appointment_payment', {
        p_appointment_id: appointmentId,
        p_patient_id: patientId,
        p_doctor_id: doctorId,
        p_amount_cents: amountCents,
        p_currency: currency,
        p_provider_payment_id: paymentId,
        p_paid_at: payment.date_approved ?? null,
      })
    const confirmed = Array.isArray(confirmationRows)
      ? confirmationRows[0]
      : confirmationRows
    if (confirmationError || !confirmed?.appointment_payment_id) {
      console.error('[mobile-payments-webhook] atomic appointment confirmation failed:', confirmationError)
      return json(503, { error: 'appointment_confirmation_failed' })
    }
    return json(200, { received: true, confirmed: true })
  } catch (error) {
    console.error('[mobile-payments-webhook] exception:', error)
    return json(500, { error: 'payment_confirmation_failed' })
  }
}

Deno.serve(handler)
