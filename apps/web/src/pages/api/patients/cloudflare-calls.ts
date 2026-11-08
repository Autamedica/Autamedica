import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'
import { withAuthRole, isAuthed, PATIENT_ROLES } from '@/lib/api-auth'
import { createAstroAdminClient } from '@/lib/supabase'
import { authorizeWebCloudflareMedia } from '@/lib/calls/web-cloudflare-media-authorization'
import { resolveCloudflareCallsEnv } from '@/lib/runtime-env'

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, PATIENT_ROLES, locals)
  if (!isAuthed(auth)) return auth

  const payload = await request.clone().json().catch(() => null)
  const roomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : ''
  if (!roomId) return Response.json({ error: 'room_id_required' }, { status: 400 })

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const access = await authorizeWebCloudflareMedia(admin, roomId, auth.user.id, 'patient')
    if (access !== 'allowed') {
      return Response.json(
        { error: access === 'payment_required' ? 'jordan_payment_required' : 'call_access_denied' },
        { status: access === 'payment_required' ? 402 : 403 },
      )
    }
  } catch (error) {
    logger.error('[patients/cloudflare-calls] Media authorization failed', error)
    return Response.json({ error: 'media_authorization_unavailable' }, { status: 503 })
  }

  const { appId, appSecret } = resolveCloudflareCallsEnv(locals.runtime?.env)
  const result = await handleCloudflareCallsProxy(request, { appId, appSecret })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  })
}
