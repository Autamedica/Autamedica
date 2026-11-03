import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false

/**
 * Physical QR entry points for AutaMedica partners.
 * Only codes registered here can redirect; visitor input is never a redirect URL.
 * QR scans measure exposure, not verified installs, appointments or commissions.
 */
const LOCATIONS: Record<string, { partner: string; country: string }> = {
  JORDAN01: { partner: 'jordan', country: 'BR' },
  JORDAN02: { partner: 'jordan', country: 'BR' },
}

type EventsTable = {
  insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>
}
type PartnerGrowthClient = {
  schema: (name: 'growth_os') => {
    from: (table: 'growth_events') => EventsTable
  }
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const code = (params.code ?? '').trim().toUpperCase()
  const location = LOCATIONS[code]

  if (!location) {
    return new Response('QR não encontrado', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
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

  // An unavailable analytics system must never prevent patients from reaching the app.
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as PartnerGrowthClient
    const { error } = await admin.schema('growth_os').from('growth_events').insert({
      event_type: 'partner_qr_scan',
      vertical: 'patients',
      page_url: '/j/' + code,
      attribution,
      metadata: {
        partner_code: location.partner,
        location_code: code,
        country_code: location.country,
      },
    })
    if (error) {
      logger.error('[partner-qr] Unable to record scan', error)
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
