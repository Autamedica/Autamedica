import type { APIRoute } from 'astro'
import { logger, BASE_URL_BY_ROLE } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth'
import { createCallStartAdapter } from '@/lib/calls/repos/call-start.adapter'

type GuestProfileRow = { first_name?: string | null; last_name?: string | null };
type GuestProfileClient = {
  from(table: 'profiles'): {
    select(columns: 'first_name, last_name'): {
      eq(column: 'user_id', value: string): {
        maybeSingle(): Promise<{ data: GuestProfileRow | null }>;
      };
    };
  };
};

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
       const profileClient = admin as unknown as GuestProfileClient
       const { data: profileData } = await profileClient
         .from('profiles')
         .select('first_name, last_name')
         .eq('user_id', appt.patient_id)
         .maybeSingle()
       if (profileData?.first_name) {
         guestName = `${profileData.first_name} ${profileData.last_name ?? ''}`.trim()
       }
    }

    // 4. Buscar llamada activa o crear una
    let call = await callStartRepo.findActiveByAppointmentId(appt.id)
    if (!call) {
      // FIX: No usar doctor.id como placeholder. Usar null si no hay paciente registrado.
      call = await callStartRepo.createCall(doctor.id, appt.patient_id ?? null, appt.id)

      // Verificación de seguridad: asegurar que la llamada quedó vinculada a la cita
      if (call.appointment_id !== appt.id) {
        logger.error('[appointment-guest-link] call was not linked to appointment', {
          callId: call.id,
          roomId: call.room_id,
          appointmentId: appt.id,
          callAppointmentId: call.appointment_id,
        })
        return internalError('call_appointment_link_failed')
      }
    }

    // 5. Crear Invitación Opaca en DB
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
      logger.error('[appointment-guest-link] failed to create opaque invite', inviteErr)
      return internalError('failed_to_create_invite')
    }
    
    /**
     * OBTENCIÓN DEL LINK FUNCIONAL CORRECTO
     */
    const siteUrl = (locals.runtime?.env?.PUBLIC_SITE_URL as string) || BASE_URL_BY_ROLE['patient']
    const origin = siteUrl ? new URL(siteUrl).origin : new URL(request.url).origin
    
    const guestLink = `${origin}/call/join/${call.room_id}?invite=${invite.id}`

    return jsonOk({ guestLink, guestName })
  } catch (err) {
    logger.error('[appointment-guest-link] generation failed', err)
    return internalError()
  }
}
