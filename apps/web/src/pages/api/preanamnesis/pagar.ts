import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { jsonOk, badRequest, internalError, notFound } from '@/lib/api-helpers'
import { getRuntimeEnvValue } from '@/lib/runtime-env'

const MERCADOPAGO_API = 'https://api.mercadopago.com'
const PRECIO_CONSULTA = 15000 // ARS

function getMercadoPagoToken(): string {
  const token = getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN') ?? (import.meta as any).env?.MERCADOPAGO_ACCESS_TOKEN
  if (!token) throw new Error('MercadoPago token missing')
  return token
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const preanamnesisId = url.searchParams.get('id')
    if (!preanamnesisId) return badRequest('missing_id')

    const supabase = createAstroAdminClient(locals.runtime?.env)

    // 1. Check if session exists
    const { data: session } = await (supabase as any)
      .from('preanamnesis_sessions')
      .select('id, status')
      .eq('id', preanamnesisId)
      .maybeSingle()

    if (!session) return notFound('session_not_found')
    if (session.status === 'paid') return jsonOk({ already_paid: true, status: 'paid' })

    // 2. Check if there's already an active payment order
    const { data: existing } = await (supabase as any)
      .from('medical_review_orders')
      .select('id, status, checkout_url')
      .eq('preanamnesis_id', preanamnesisId)
      .maybeSingle()

    if (existing?.status === 'paid') {
      return jsonOk({ already_paid: true, status: 'paid' })
    }

    if (existing?.checkout_url) {
      // Redirect to existing checkout
      return new Response(null, {
        status: 302,
        headers: { Location: existing.checkout_url },
      })
    }

    // 3. Create or reuse medical_review_order
    const orderId = existing?.id || crypto.randomUUID()

    if (!existing) {
      await (supabase as any).from('medical_review_orders').insert({
        id: orderId,
        preanamnesis_id: preanamnesisId,
        status: 'pending_payment',
        amount_cents: PRECIO_CONSULTA * 100,
        currency: 'ARS',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    // 4. Create MercadoPago preference
    const appUrl = 'https://www.autamedica.com'
    const token = getMercadoPagoToken()

    const mpResponse = await fetch(`${MERCADOPAGO_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        items: [{
          title: 'AutaMedica - Revisión médica',
          description: 'Consulta médica por videollamada con receta electrónica',
          quantity: 1,
          unit_price: PRECIO_CONSULTA,
          currency_id: 'ARS',
        }],
        back_urls: {
          success: `${appUrl}/patients/appointments?payment=success&preanamnesisId=${preanamnesisId}`,
          failure: `${appUrl}/preanamnesis/pago?status=failure&id=${preanamnesisId}`,
          pending: `${appUrl}/preanamnesis/pago?status=pending&id=${preanamnesisId}`,
        },
        auto_return: 'approved',
        statement_descriptor: 'AUTAMEDICA',
        external_reference: `preanamnesis|${preanamnesisId}`,
        notification_url: `${appUrl}/api/preanamnesis/payments/webhook`,
        metadata: {
          preanamnesis_id: preanamnesisId,
          order_id: orderId,
        },
      }),
    })

    if (!mpResponse.ok) {
      const body = await mpResponse.text()
      throw new Error(`MercadoPago API ${mpResponse.status}: ${body}`)
    }

    const preference = await mpResponse.json() as { id: string; init_point: string }

    // 5. Update order with preference info
    await (supabase as any).from('medical_review_orders').update({
      provider_preference_id: preference.id,
      checkout_url: preference.init_point,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId)

    // 6. Redirect to MercadoPago checkout
    return new Response(null, {
      status: 302,
      headers: { Location: preference.init_point },
    })
  } catch (error) {
    console.error('[preanamnesis/pagar]', error)
    return internalError('payment_setup_failed')
  }
}
