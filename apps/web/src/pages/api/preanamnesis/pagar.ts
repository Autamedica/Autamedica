import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAstroAdminClient } from '@/lib/supabase'

const MERCADOPAGO_API = 'https://api.mercadopago.com'
const PRECIO_CONSULTA = 15000

function getToken(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return env?.MERCADOPAGO_ACCESS_TOKEN || ''
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const preanamnesisId = url.searchParams.get('id')
    if (!preanamnesisId) {
      return new Response(JSON.stringify({ error: 'missing_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const token = getToken()
    if (!token) {
      return new Response(JSON.stringify({ error: 'payment_unavailable', message: 'Token no configurado' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
    }

    const supabase = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient

    // Check session exists
    const { data: session } = await supabase
      .from('preanamnesis_sessions')
      .select('id, status')
      .eq('id', preanamnesisId)
      .maybeSingle()

    if (!session) {
      return new Response(JSON.stringify({ error: 'session_not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    if (session.status === 'paid') {
      return new Response(JSON.stringify({ already_paid: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Check existing order
    const { data: existing } = await supabase
      .from('medical_review_orders')
      .select('id, status, payment_url')
      .eq('preanamnesis_id', preanamnesisId)
      .maybeSingle()

    if (existing?.payment_url && existing?.status !== 'paid') {
      return new Response(null, { status: 302, headers: { Location: existing.payment_url } })
    }

    if (existing?.status === 'paid') {
      return new Response(JSON.stringify({ already_paid: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Create order
    const orderId = existing?.id || `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    if (!existing) {
      await supabase.from('medical_review_orders').insert({
        id: orderId,
        preanamnesis_id: preanamnesisId,
        status: 'pending_payment',
        amount_cents: PRECIO_CONSULTA * 100,
        currency: 'ARS',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    // Create MercadoPago preference
    const mpResp = await fetch(`${MERCADOPAGO_API}/checkout/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{
          title: 'AutaMedica - Revision medica',
          description: 'Consulta medica por videollamada con receta electronica',
          quantity: 1,
          unit_price: PRECIO_CONSULTA,
          currency_id: 'ARS',
        }],
        back_urls: {
          success: 'https://www.autamedica.com/patients/appointments?payment=success',
          failure: 'https://www.autamedica.com/preanamnesis?payment=failure',
          pending: 'https://www.autamedica.com/preanamnesis?payment=pending',
        },
        auto_return: 'approved',
        statement_descriptor: 'AUTAMEDICA',
        external_reference: `preanamnesis|${preanamnesisId}`,
        notification_url: 'https://www.autamedica.com/api/preanamnesis/payments/webhook',
        metadata: { preanamnesis_id: preanamnesisId, order_id: orderId },
      }),
    })

    if (!mpResp.ok) {
      const body = await mpResp.text()
      return new Response(JSON.stringify({ error: 'mercadopago_error', detail: body }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }

    const preference = await mpResp.json() as { id: string; init_point: string }

    // Update order
    await supabase.from('medical_review_orders').update({
      provider_preference_id: preference.id,
      payment_url: preference.init_point,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId)

    // Redirect
    return new Response(null, { status: 302, headers: { Location: preference.init_point } })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown'
    return new Response(JSON.stringify({ error: 'internal', message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
