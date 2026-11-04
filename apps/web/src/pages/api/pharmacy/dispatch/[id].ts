import type { APIRoute } from 'astro'
import { internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
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
        if (guestPayload?.callId === requestRecord.id &&
          guestPayload.roomId === requestRecord.cloudflare_room_id) {
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
        // The authenticated owner may read their own request.
        if (requestRecord.requested_by_user_id === authUserId) {
          isAuthorized = true
        } else {
          const { data: doctorRow } = await supabase
            .from('doctors')
            .select('id, active, care_country, license_type, uf_brazil')
            .eq('user_id', authUserId)
            .maybeSingle()

          // A doctor, including an on-duty doctor, may only view requests
          // matching a verifiable professional registration country.
          const license = doctorRow?.license_type?.trim().toUpperCase()
          const credentialCountry = license === 'CRM' && doctorRow?.uf_brazil
            ? 'BR'
            : license === 'MN' || license === 'MP'
              ? 'AR' : null
          const countryVerified = Boolean(
            doctorRow?.active && credentialCountry &&
            requestRecord.care_country === credentialCountry &&
            (!doctorRow.care_country || doctorRow.care_country === credentialCountry),
          )

          if (countryVerified && doctorRow) {
            if (requestRecord.assigned_doctor_id === doctorRow.id) {
              isAuthorized = true
            } else if (!requestRecord.assigned_doctor_id) {
              const { data: dutyStatus } = await supabase
                .from('doctor_duty_status')
                .select('is_on_duty')
                .eq('doctor_id', doctorRow.id)
                .maybeSingle()
              isAuthorized = dutyStatus?.is_on_duty === true
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
        .select('id, user_id, license_number, specialty')
        .eq('id', requestRecord.assigned_doctor_id)
        .maybeSingle()

      if (doctorRow) {
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