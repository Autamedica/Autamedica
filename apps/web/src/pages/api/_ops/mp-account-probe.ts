import type { APIRoute } from 'astro'
import { getRuntimeEnvValue } from '@/lib/runtime-env'

const PROBE_KEY = 'MP-account-probe-7b1d9e7c43a84f5e9a2c0d61b8f43a72'

export const GET: APIRoute = async ({ request, locals }) => {
  if (request.headers.get('x-autamedica-mp-probe') !== PROBE_KEY) {
    return new Response(null, { status: 404 })
  }

  const token = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
    ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')

  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
  if (!token) {
    return new Response(JSON.stringify({ configured: false }), { status: 200, headers })
  }

  try {
    const response = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      return new Response(JSON.stringify({
        configured: true,
        valid: false,
        providerHttpStatus: response.status,
      }), { status: 200, headers })
    }
    const account = await response.json() as {
      id?: number | string
      site_id?: string
      country_id?: string
    }
    return new Response(JSON.stringify({
      configured: true,
      valid: true,
      account: {
        id: account.id ?? null,
        site_id: account.site_id ?? null,
        country_id: account.country_id ?? null,
      },
    }), { status: 200, headers })
  } catch {
    return new Response(JSON.stringify({ configured: true, valid: false, providerHttpStatus: null }), {
      status: 200,
      headers,
    })
  }
}
