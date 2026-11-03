import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false

const CLICK_TOKEN = /^[0-9a-f]{32}$/

async function hashToken(token: string): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('')
}

export const POST: APIRoute = async ({ request, locals }) => {
  const bearer = request.headers.get('authorization') ?? ''
  const accessToken = /^Bearer\s+(.+)$/i.exec(bearer)?.[1]
  if (!accessToken || accessToken.length > 4096) {
    return Response.json({ error: 'authentication_required' }, { status: 401 })
  }

  let body: unknown
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 4096) {
      return Response.json({ error: 'invalid_request' }, { status: 400 })
    }
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const input = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown> : {}
  const clickToken = input.click_token
  const source = input.source
  if (typeof clickToken !== 'string' || !CLICK_TOKEN.test(clickToken) ||
      (source !== 'play_install_referrer' && source !== 'app_link')) {
    return Response.json({ error: 'invalid_attribution' }, { status: 400 })
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    // Validate the access token on Supabase Auth, never trust a client-supplied user ID.
    const { data: auth, error: authError } = await admin.auth.getUser(accessToken)
    if (authError || !auth.user) {
      return Response.json({ error: 'authentication_required' }, { status: 401 })
    }

    const tokenHash = await hashToken(clickToken)
    const typedRpc = admin as unknown as {
      rpc: (name: 'claim_partner_attribution', args: {
        p_token_hash: string
        p_patient_user_id: string
        p_source: string
      }) => Promise<{ data: boolean | null; error: unknown }>
    }
    const { data: claimed, error } = await typedRpc.rpc('claim_partner_attribution', {
      p_token_hash: tokenHash,
      p_patient_user_id: auth.user.id,
      p_source: source,
    })
    if (error) {
      logger.error('[partner-claim] RPC failed', error)
      return Response.json({ error: 'attribution_unavailable' }, { status: 503 })
    }
    return Response.json({ attributed: claimed === true }, {
      status: claimed === true ? 200 : 409,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    logger.error('[partner-claim] Server error', error)
    return Response.json({ error: 'attribution_unavailable' }, { status: 503 })
  }
}
