import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false

/** Strict allowlist: visiting a QR does not itself earn a commission. */
const LOCATIONS: Record<string, { partner: string; country: string }> = {
  JORDAN01: { partner: 'jordan', country: 'BR' },
  JORDAN02: { partner: 'jordan', country: 'BR' },
}

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    .then(buffer => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join(''))
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const code = (params.code ?? '').trim().toUpperCase()
  const location = LOCATIONS[code]
  if (!location) {
    return new Response('QR não encontrado', {
      status: 404, headers: { 'Cache-Control': 'no-store' },
    })
  }

  const attribution = {
    utm_source: 'cantina_jordan',
    utm_medium: 'qr',
    utm_campaign: 'partner_jordan',
    utm_content: code.toLowerCase(),
  }
  const destination = new URL('/descargar', request.url)
  for (const [key, value] of Object.entries(attribution)) {
    destination.searchParams.set(key, value)
  }

  // Opaque 128-bit visit token. Hash only is stored server-side.
  // If persistence fails, redirect without a claimable token.
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as {
      from: (name: 'partner_qr_visits') => {
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>
      }
      schema: (name: 'growth_os') => {
        from: (name: 'growth_events') => {
          insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>
        }
      }
    }
    const token = crypto.randomUUID().replaceAll('-', '')
    const tokenHash = await sha256Hex(token)
    const { error } = await admin.from('partner_qr_visits').insert({
      token_hash: tokenHash,
      partner_code: location.partner,
      location_code: code,
      country_code: location.country,
    })
    if (error) {
      logger.error('[partner-qr] Visit persistence failed', error)
    } else {
      destination.searchParams.set('utm_term', 'click_' + token)
      // Optional marketing analytics: must not affect the authoritative visit.
      try {
        const { error: eventError } = await admin.schema('growth_os').from('growth_events').insert({
          event_type: 'partner_qr_scan',
          vertical: 'patients',
          page_url: '/j/' + code,
          attribution,
          metadata: { partner_code: location.partner, location_code: code, country_code: location.country },
        })
        if (eventError) logger.error('[partner-qr] Growth event not recorded', eventError)
      } catch (eventError) {
        logger.error('[partner-qr] Growth events unavailable', eventError)
      }
    }
  } catch (error) {
    logger.error('[partner-qr] Analytics unavailable', error)
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.pathname + destination.search,
      'Cache-Control': 'no-store, private',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
