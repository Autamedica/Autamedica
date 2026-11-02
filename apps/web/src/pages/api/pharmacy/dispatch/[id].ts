import type { APIRoute } from 'astro'
import { internalError, jsonOk, notFound, unauthorized, conflict } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { logger } from '@autamedica/shared'

/**
 * GET /api/pharmacy/dispatch/[id]
 *
 * Devuelve una solicitud on-demand con la identidad real del médico asignado.
 * Protegido contra fuga de PHI:
 * a) Usuario autenticado en sesión: debe ser médico asignado, médico de guardia o paciente dueño (requested_by_user_id).
 * b) Kiosco / invitado: requiere token de acceso criptográfico válido (?token= o Authorization: Bearer).
 */
export const GET: APIRoute = async ({ params, locals, request }) => {
  const id = params.id?.trim()
  if (!id) return notFound('missing_request_id')

  try {
    const supabase = createAstroAdminClient(locals.runtime?.env)

    const { data: requestRecord, error } = await supabase
      .from('pharmacy_dispatch_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !requestRecord) {
      logger.warn('[api/pharmacy/dispatch/[id]] Request not found', { id })
      return notFound('request_not_found')
    }

    if (!['AR', 'BR'].includes(requestRecord.care_country ?? '')) return notFound('request_not_available')

    // Tokens are capabilities, not permanent clinical authorization: honor revocation.
    if (!requestRecord.requested_by_user_id) return unauthorized()
    const [owner, ownerProfile] = await Promise.all([
      supabase.from('patients').select('id').eq('user_id', requestRecord.requested_by_user_id)
        .eq('care_country', requestRecord.care_country).eq('active', true).maybeSingle(),
      supabase.from('profiles').select('user_id').eq('user_id', requestRecord.requested_by_user_id)
        .eq('role', 'patient').eq('active', true).maybeSingle(),
    ])
    if (owner.error || ownerProfile.error || !owner.data || !ownerProfile.data) return unauthorized()

    // Extraer token de query param o header Authorization
    const url = new URL(request.url)
    const queryToken = url.searchParams.get('token')?.trim() || null
    const authHeader = request.headers.get('authorization')?.trim() || null
    let bearerToken: string | null = null
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      bearerToken = authHeader.slice(7).trim() || null
    }
    const candidateGuestToken = queryToken || bearerToken

    let isAuthorized = false

    // b) Si es petición de kiosco/invitado: validar token de acceso criptográfico
    if (candidateGuestToken) {
      const secret = resolveGuestSecret(locals.runtime?.env)
      if (secret) {
        const guestPayload = await verifyGuestToken(candidateGuestToken, secret)
        if (guestPayload?.callId === requestRecord.id && guestPayload.roomId === requestRecord.cloudflare_room_id) {
          isAuthorized = true
        }
      }
    }

    // a) Si no se autorizó como invitado, verificar sesión autenticada
    if (!isAuthorized) {
      const sessionUser = (locals as { user?: { id: string } }).user ?? locals.session?.user
      let authUserId = sessionUser?.id

      if (!authUserId && locals.supabase) {
        const { data: userData } = await locals.supabase.auth.getUser()
        if (userData?.user?.id) {
          authUserId = userData.user.id
        }
      }

      if (!authUserId && bearerToken && locals.supabase) {
        const { data: jwtData } = await locals.supabase.auth.getUser(bearerToken)
        if (jwtData?.user?.id) {
          authUserId = jwtData.user.id
        }
      }

      if (authUserId) {
        // a.1) Paciente dueño de la solicitud
        if (requestRecord.requested_by_user_id && requestRecord.requested_by_user_id === authUserId) {
          isAuthorized = true
        }
        else {
          // Resolver registro de médico
          const { data: doctorRow } = await supabase
            .from('doctors')
            .select('id, care_country, active')
            .eq('user_id', authUserId)
            .maybeSingle()

          const { data: activeProfile } = await supabase.from('profiles').select('user_id')
            .eq('user_id', authUserId).eq('active', true).eq('role', 'doctor').maybeSingle()
          if (activeProfile && doctorRow?.active && doctorRow.care_country === requestRecord.care_country) {
            // a.3) Doctor asignado por id en tabla doctors
            if (requestRecord.assigned_doctor_id && requestRecord.assigned_doctor_id === doctorRow.id) {
              isAuthorized = true
            }
          }
        }
      }
    }

    if (!isAuthorized) {
      return unauthorized('Requiere sesión o token de acceso válido')
    }

    let doctor: { full_name: string; license_number: string; specialty: string } | null = null

    if (requestRecord.assigned_doctor_id) {
      const { data: doctorRow } = await supabase
        .from('doctors')
        .select('id, user_id, license_number, specialty, care_country, active')
        .eq('id', requestRecord.assigned_doctor_id)
        .maybeSingle()

      if (doctorRow?.active && doctorRow.care_country === requestRecord.care_country) {
        let fullName = ''
        if (doctorRow.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', doctorRow.user_id)
            .maybeSingle()
          fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
        }
        doctor = {
          full_name: fullName || 'Médico AutaMedica',
          license_number: doctorRow.license_number,
          specialty: doctorRow.specialty,
        }
      }
    }

    return jsonOk({ request: requestRecord, doctor })
  } catch (err) {
    logger.error('[api/pharmacy/dispatch/[id]] Exception', { err })
    return internalError()
  }
}

/** Cancel only the authenticated owner's canonical request, without touching Gen 1. */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context?.careCountry) return unauthorized()
  if (!params.id) return notFound()
  const admin = createAstroAdminClient(locals.runtime?.env)
  const { data, error } = await admin.from('pharmacy_dispatch_requests')
    .update({ status: 'cancelled' }).eq('id', params.id)
    .eq('patient_id', context.patientId).eq('requested_by_user_id', context.userId)
    .eq('care_country', context.careCountry).eq('status', 'searching')
    .select('id').maybeSingle()
  if (error) return internalError()
  if (!data) return conflict('request_cannot_be_cancelled')
  return jsonOk({ cancelled: true })
}
