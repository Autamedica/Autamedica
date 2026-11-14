import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { conflict, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'
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
    // New protected offer table and approval RPC are not yet in generated types.
    const dispatchAdmin = supabase as unknown as SupabaseClient

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
            // Admin client bypasses RLS: re-check the central clinical
            // approval predicate before exposing PHI to any doctor.
            const { data: approved, error: approvalError } = await dispatchAdmin.rpc(
              'admin_is_dispatch_doctor_approved',
              { p_doctor_id: doctorRow.id },
            )
            if (!approvalError && approved === true) {
              if (requestRecord.assigned_doctor_id === doctorRow.id) {
              isAuthorized = true
            } else if (!requestRecord.assigned_doctor_id) {
              // Being on duty does not grant access to every patient's
              // intake within the jurisdiction. Require a current offer to
              // this exact doctor; RLS alone cannot protect admin queries.
              const { data: activeOffer } = await dispatchAdmin
                .from('dispatch_offers')
                .select('id')
                .eq('doctor_id', doctorRow.id)
                .eq('dispatch_request_id', requestRecord.id)
                .eq('status', 'pending')
                .gt('expires_at', new Date().toISOString())
                .maybeSingle()
              isAuthorized = Boolean(activeOffer?.id)
              }
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

/**
 * DELETE /api/pharmacy/dispatch/[id]
 * Cancels only the authenticated patient's own still-searching request.
 * The legacy Gen 1 cancellation endpoint remains available for old clients.
 */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  try {
    const id = params.id?.trim()
    if (!id) return notFound('missing_request_id')

    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: requestRecord, error: lookupError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id, patient_id, requested_by_user_id, care_country, cloudflare_room_id')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) return internalError()
    if (!requestRecord) return notFound('request_not_found')

    const context = await resolvePatientContext(request, locals).catch(() => null)
    if (context?.careCountry &&
        requestRecord.patient_id === context.patientId &&
        requestRecord.requested_by_user_id === context.userId &&
        requestRecord.care_country === context.careCountry) {
      const { data, error } = await admin
        .from('pharmacy_dispatch_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('patient_id', context.patientId)
        .eq('requested_by_user_id', context.userId)
        .eq('care_country', context.careCountry)
        .eq('status', 'searching')
        .select('id')
        .maybeSingle()
      if (error) return internalError()
      if (!data) return conflict('request_cannot_be_cancelled')
      return jsonOk({ cancelled: true })
    }

    const guestToken = request.headers.get('x-guest-token')?.trim()
      || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
      || ''
    if (!guestToken) return unauthorized()
    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) return unauthorized()
    const guestPayload = await verifyGuestToken(guestToken, secret)
    if (!guestPayload ||
        guestPayload.callId !== requestRecord.id ||
        guestPayload.roomId !== requestRecord.cloudflare_room_id) {
      return unauthorized()
    }

    const { data, error } = await admin
      .from('pharmacy_dispatch_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .is('requested_by_user_id', null)
      .eq('care_country', requestRecord.care_country)
      .eq('status', 'searching')
      .select('id')
      .maybeSingle()
    if (error) return internalError()
    if (!data) return conflict('request_cannot_be_cancelled')
    return jsonOk({ cancelled: true })
  } catch (err) {
    logger.error('[api/pharmacy/dispatch/[id]] DELETE exception', { err })
    return internalError()
  }
}