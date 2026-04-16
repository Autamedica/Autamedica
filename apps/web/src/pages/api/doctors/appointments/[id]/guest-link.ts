import type { APIRoute } from 'astro'
import { logger, BASE_URL_BY_ROLE } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, forbidden, internalError, jsonOk, notFound, serviceUnavailable } from '@/lib/api-helpers'
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { createCallStartAdapter } from '@/lib/calls/repos/call-start.adapter'

export const POST: APIRoute = async ({ request, params, locals }) => {
  const appointmentId = params.id?.trim()
  if (!appointmentId) return badRequest('missing_appointment_id')

  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const callStartRepo = createCallStartAdapter(admin)

    // 1. Verificar que la cita existe
    const appt = await callStartRepo.findAppointmentById(appointmentId)
    if (!appt) return notFound('appointment_not_found')

    // 2. Verificar que el doctor sea el dueño
    const { data: doctor } = await admin
      .from('doctors')
      .select('id')
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (doctor?.id !== appt.doctor_id) {
      return forbidden('not_appointment_owner')
    }

    // 3. Obtener nombre del invitado desde las notas si no hay patient_id
    let guestName = 'Invitado'
    if (!appt.patient_id) {
      const { data: fullAppt } = await admin.from('appointments').select('notes').eq('id', appt.id).maybeSingle()
      const match = fullAppt?.notes?.match(/\[INVITADO:\s*([^\]]+)\]/)
      if (match?.[1]) {
        guestName = match[1].trim()
      }
    } else {
       // Si hay patient_id, resolvemos el nombre
       const { data: profileData } = await admin.from('profiles').select('first_name, last_name').eq('id', appt.patient_id).maybeSingle()
       if (profileData?.first_name) {
         guestName = `${profileData.first_name} ${profileData.last_name ?? ''}`.trim()
       }
    }

    // 4. Buscar llamada activa o crear una
    let call = await callStartRepo.findActiveByAppointmentId(appt.id)
    if (!call) {
      // Usamos doctor.id como placeholder temporal en patient_id si es invitado
      call = await callStartRepo.createCall(doctor.id, appt.patient_id ?? doctor.id, appt.id)
    }

    // 5. Generar token
    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) {
      logger.error('[appointment-guest-link] GUEST_TOKEN_SECRET not configured')
      return serviceUnavailable('guest_invites_not_configured')
    }

    const token = await signGuestToken({ callId: call.id, roomId: call.room_id, guestName }, secret)
    
    /**
     * OBTENCIÓN DEL LINK FUNCIONAL CORRECTO
     */
    const siteUrl = (locals.runtime?.env?.PUBLIC_SITE_URL as string) || BASE_URL_BY_ROLE['patient']
    const origin = siteUrl ? new URL(siteUrl).origin : new URL(request.url).origin
    
    const guestLink = `${origin}/call/join/${call.room_id}?token=${encodeURIComponent(token)}`

    return jsonOk({ guestLink, guestName })
  } catch (err) {
    logger.error('[appointment-guest-link] generation failed', err)
    return internalError()
  }
}
