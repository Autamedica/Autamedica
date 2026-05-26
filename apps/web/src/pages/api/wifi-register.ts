import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, serviceUnavailable } from '@/lib/api-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX = 20 // 20 requests per hour per IP (generous for shared Wi-Fi IPs)

type WifiRegisterRequest = {
  name?: unknown
  phone?: unknown
  email?: unknown
  vertical?: unknown
  mac?: unknown
  ap?: unknown
  base_grant_url?: unknown
  user_continue_url?: unknown
}

export const POST: APIRoute = async ({ request, locals }) => {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'

  // En una red Wi-Fi compartida, muchos usuarios saldrán con la misma IP pública.
  // Por eso el rate limit para wifi es más amplio.
  if (!checkRateLimit(`wifi-register:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return serviceUnavailable('rate_limited')
  }

  let body: WifiRegisterRequest
  try {
    body = (await request.json()) as WifiRegisterRequest
  } catch {
    return badRequest('invalid_json')
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim().replace(/[\s\-()]/g, '') : ''
  const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const vertical = typeof body.vertical === 'string' ? body.vertical.trim().toLowerCase() : 'wifi'

  if (!rawName) {
    return badRequest('name_required')
  }

  if (!rawPhone && !rawEmail) {
    return badRequest('phone_or_email_required')
  }

  // Si tenemos teléfono, validamos un formato numérico básico
  if (rawPhone && rawPhone.length < 8) {
    return badRequest('invalid_phone_format')
  }

  // Generamos un email ficticio único si no nos dio email, para cumplir con el esquema
  const email = rawEmail || `${rawPhone || Math.random().toString(36).substring(2)}@autamedica.wifi`
  const phone = rawPhone || null

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAstroAdminClient(locals.runtime?.env) as any

    // 1. Insertamos o actualizamos el Lead en growth_os.leads
    const { data: lead, error: leadError } = await admin
      .schema('growth_os')
      .from('leads')
      .upsert(
        {
          email,
          name: rawName,
          phone,
          vertical,
          intent: 'wifi_captive_portal',
          form_id: 'wifi_portal',
          consent_marketing: true,
          consent_source: 'wifi_captive_portal',
          metadata: {
            mac: body.mac || null,
            ap_mac: body.ap || null,
            registered_from_ip: ip,
            base_grant_url: body.base_grant_url || null,
            user_continue_url: body.user_continue_url || null,
          },
        },
        { onConflict: 'email_normalized,form_id,vertical' }
      )
      .select('id, status')
      .single()

    if (leadError || !lead) {
      throw leadError ?? new Error('Failed to upsert lead')
    }

    // 2. Insertamos el evento de adquisición en growth_os.growth_events
    const { error: eventError } = await admin
      .schema('growth_os')
      .from('growth_events')
      .insert({
        event_type: 'wifi_signup',
        lead_id: lead.id,
        vertical,
        metadata: {
          mac: body.mac || null,
          ap: body.ap || null,
        },
      })

    if (eventError) {
      logger.error('[wifi-register] Failed to insert growth event', eventError)
    }

    // 3. Creamos un Agent Job del tipo 'concierge' en la base de datos para que
    //    el Growth Agent Worker lo procese de inmediato y le mande WhatsApp.
    const { error: jobError } = await admin
      .schema('growth_os')
      .from('agent_jobs')
      .insert({
        agent_type: 'concierge',
        trigger_type: 'wifi_portal_signup',
        source_table: 'leads',
        source_id: lead.id,
        lead_id: lead.id,
        channel: phone ? 'whatsapp_openclaw' : 'email_brevo',
        payload: {
          wifi_signup: true,
          name: rawName,
        },
        status: 'ready',
        attempts: 0,
        idempotency_key: `wifi_signup_${lead.id}`,
      })

    if (jobError) {
      logger.error('[wifi-register] Failed to enqueue growth agent job', jobError)
    }

    return jsonOk({
      success: true,
      lead_id: lead.id,
      status: lead.status,
    })
  } catch (err) {
    logger.error('[wifi-register] Internal database error during registration', err)
    return internalError('registration_failed')
  }
}

export const GET: APIRoute = async () =>
  jsonOk({
    endpoint: 'wifi-register',
    accepts: 'POST',
  })
