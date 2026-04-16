import type { APIRoute } from 'astro'
import { logger, BASE_URL_BY_ROLE } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, forbidden, internalError, jsonOk, notFound, serviceUnavailable } from '@/lib/api-helpers'
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth'

export const POST: APIRoute = async ({ request, params, locals }) => {
  const callId = params.callId?.trim()
  if (!callId) return badRequest('missing_call_id')

  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    // 1. Verificar que la llamada existe
    const { data: call } = await admin.from('calls').select('*').eq('id', callId).maybeSingle()
    if (!call) return notFound('call_not_found')

    // 2. Verificar que el doctor sea el dueño
    const { data: doctor } = await admin
      .from('doctors')
      .select('id')
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (doctor?.id !== call.doctor_id) {
      return forbidden('not_call_owner')
    }

    // 3. Obtener nombre del invitado
    let guestName = 'Invitado'
    if (call.patient_id) {
       const { data: profileData } = await admin.from('profiles').select('first_name, last_name').eq('id', call.patient_id).maybeSingle()
       if (profileData?.first_name) {
         guestName = `${profileData.first_name} ${profileData.last_name ?? ''}`.trim()
       }
    }

    // 4. Crear Invitación Opaca en DB
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { data: invite, error: inviteErr } = await admin
      .from('call_guest_invites')
      .insert({
        call_id: call.id,
        room_id: call.room_id,
        guest_name: guestName,
        expires_at: expiresAt
      })
      .select('id')
      .single()

    if (inviteErr || !invite) {
      logger.error('[call-guest-link] failed to create opaque invite', inviteErr)
      return internalError('failed_to_create_invite')
    }
    
    const siteUrl = (locals.runtime?.env?.PUBLIC_SITE_URL as string) || BASE_URL_BY_ROLE['patient']
    const origin = siteUrl ? new URL(siteUrl).origin : new URL(request.url).origin
    
    const guestLink = `${origin}/call/join/${call.room_id}?invite=${invite.id}`

    return jsonOk({ guestLink, guestName })
  } catch (err) {
    logger.error('[call-guest-link] generation failed', err)
    return internalError()
  }
}