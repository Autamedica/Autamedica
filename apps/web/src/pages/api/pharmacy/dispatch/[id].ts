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
function findMemedString(
  value: unknown,
  acceptedKeys: Set<string>,
  depth = 0,
): string | null {
  if (depth > 6 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMemedString(item, acceptedKeys, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const object = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(object)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (acceptedKeys.has(normalized) && typeof nested === 'string'
      && nested.trim().length >= 4 && nested.trim().length <= 128) {
      return nested.trim();
    }
  }
  for (const nested of Object.values(object)) {
    const found = findMemedString(nested, acceptedKeys, depth + 1);
    if (found) return found;
  }
  return null;
}

function findMemedDocumentUrl(value: unknown, depth = 0): string | null {
  if (depth > 6 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMemedDocumentUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const object = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(object)) {
    if (/(url|link|pdf|document)/i.test(key) && typeof nested === 'string') {
      try {
        const url = new URL(nested);
        if (url.protocol === 'https:' && /(^|[.])memed[.]com(?:[.]br)?$/i.test(url.hostname)) return url.toString();
      } catch { /* Ignore malformed provider URL. */ }
    }
  }
  for (const nested of Object.values(object)) {
    const found = findMemedDocumentUrl(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

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

    const documents: Array<{
      id: string; kind: 'memed' | 'core' | 'certificate'; title: string;
      provider: string; createdAt: string; status: string; verificationCode: string | null;
      accessCode?: string | null; downloadUrl: string;
    }> = []
    if (['in_call', 'completed'].includes(String(requestRecord.status))
      && requestRecord.patient_id && requestRecord.assigned_doctor_id) {
      const startedAt = String(requestRecord.call_started_at ?? requestRecord.created_at)
      const [{ data: memedRows }, { data: coreRows }, { data: certificates }] = await Promise.all([
        dispatchAdmin.from('memed_prescriptions')
          .select('id,memed_id,status,provider_data,digital_link_data,created_at')
          .eq('patient_id', requestRecord.patient_id)
          .eq('doctor_id', requestRecord.assigned_doctor_id)
          .gte('created_at', startedAt)
          .order('created_at', { ascending: false }),
        dispatchAdmin.from('prescriptions')
          .select('id,status,cuir,clinical_data,signed_pdf_url,signature_method,created_at,vendor_name')
          .eq('patient_id', requestRecord.patient_id)
          .eq('doctor_id', requestRecord.assigned_doctor_id)
          .gte('created_at', startedAt)
          .order('created_at', { ascending: false }),
        dispatchAdmin.from('medical_certificates')
          .select('id,status,cuir,certificate_type,signed_pdf_url,created_at')
          .eq('patient_id', requestRecord.patient_id)
          .eq('doctor_id', requestRecord.assigned_doctor_id)
          .gte('created_at', startedAt)
          .order('created_at', { ascending: false }),
      ])
      const tokenSuffix = candidateGuestToken ? `?token=${encodeURIComponent(candidateGuestToken)}` : ''
      for (const row of memedRows ?? []) {
        if (row.status === 'deleted' || !findMemedDocumentUrl(row.digital_link_data)) continue
        const provider = row.provider_data && typeof row.provider_data === 'object' ? row.provider_data as Record<string, unknown> : {}
        const linkData = row.digital_link_data
        const label = String(provider.medication_name ?? provider.nome ?? provider.title ?? 'Receita digital Memed')
        documents.push({
          id: `memed-${row.id}`, kind: 'memed', title: label,
          provider: 'Memed BR', createdAt: row.created_at, status: row.status,
          verificationCode: findMemedString(linkData, new Set(['verificationcode', 'prescriptiontoken', 'recipetoken', 'tokenreceita', 'tokenfarmacia', 'farmaciatoken'])),
          accessCode: findMemedString(linkData, new Set(['unlockcode', 'accesscode', 'password', 'senha', 'codigodesbloqueio', 'codigoacesso', 'pin'])),
          downloadUrl: `/api/pharmacy/dispatch/${encodeURIComponent(id)}/documents/memed-${encodeURIComponent(row.id)}${tokenSuffix}`,
        })
      }
      for (const row of coreRows ?? []) {
        if (row.status !== 'active' || row.signature_method !== 'ac_external') continue
        const clinical = row.clinical_data && typeof row.clinical_data === 'object' ? row.clinical_data as Record<string, unknown> : {}
        const items = Array.isArray(clinical.items) ? clinical.items as Array<Record<string, unknown>> : []
        const title = String(clinical.medication_name ?? items[0]?.commercialName ?? items[0]?.genericName ?? 'Receta médica')
        documents.push({
          id: `core-${row.id}`, kind: 'core', title,
          provider: row.vendor_name === 'memed' ? 'Memed BR' : 'RCTA / Core AR',
          createdAt: row.created_at, status: row.status, verificationCode: row.cuir,
          downloadUrl: `/api/pharmacy/dispatch/${encodeURIComponent(id)}/documents/core-${encodeURIComponent(row.id)}${tokenSuffix}`,
        })
      }
      for (const row of certificates ?? []) {
        if (row.status !== 'signed') continue
        documents.push({
          id: `certificate-${row.id}`, kind: 'certificate',
          title: row.certificate_type === 'reposo_laboral' ? 'Atestado médico' : 'Certificado médico',
          provider: 'AutaMedica', createdAt: row.created_at, status: row.status,
          verificationCode: row.cuir,
          downloadUrl: `/api/pharmacy/dispatch/${encodeURIComponent(id)}/documents/certificate-${encodeURIComponent(row.id)}${tokenSuffix}`,
        })
      }
    }

    return jsonOk({ request: requestRecord, doctor, documents })
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
      .select('id, patient_id, requested_by_user_id, care_country, cloudflare_room_id, status')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) return internalError()
    if (!requestRecord) return notFound('request_not_found')

    const logCancellationConflict = async (actor: 'patient' | 'guest') => {
      let payment: { status?: string | null; provider?: string | null; currency?: string | null } | null = null
      try {
        const { data, error } = await admin
          .from('pharmacy_dispatch_payments')
          .select('status, provider, currency')
          .eq('dispatch_request_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        payment = data
        if (error) {
          logger.warn('[api/pharmacy/dispatch/[id]] cancellation_diagnostic_lookup_failed', {
            operation: 'DELETE', request_id: id, error,
          })
        }
      } catch (error) {
        // Diagnostic logging must never replace the deterministic 409 response.
        logger.warn('[api/pharmacy/dispatch/[id]] cancellation_diagnostic_lookup_failed', {
          operation: 'DELETE', request_id: id, error,
        })
      }
      logger.warn('[api/pharmacy/dispatch/[id]] cancellation_conflict', {
        operation: 'DELETE',
        actor,
        request_id: id,
        request_status: requestRecord.status,
        care_country: requestRecord.care_country,
        payment_status: payment?.status ?? null,
        payment_provider: payment?.provider ?? null,
        payment_currency: payment?.currency ?? null,
        reason: 'request_not_searching_or_state_changed',
      })
    }

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
      if (!data) {
        await logCancellationConflict('patient')
        return conflict('request_cannot_be_cancelled')
      }
      return jsonOk({ cancelled: true })
    }

    const guestBody = await request.clone().json().catch(() => null) as {
      accessToken?: unknown
      guestRecoveryCredential?: unknown
    } | null
    const guestToken = request.headers.get('x-guest-token')?.trim()
      || request.headers.get('x-guest-recovery-credential')?.trim()
      || request.headers.get('x-access-token')?.trim()
      || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
      || (typeof guestBody?.accessToken === 'string' ? guestBody.accessToken.trim() : '')
      || (typeof guestBody?.guestRecoveryCredential === 'string' ? guestBody.guestRecoveryCredential.trim() : '')
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
    if (!data) {
      await logCancellationConflict('guest')
      return conflict('request_cannot_be_cancelled')
    }
    return jsonOk({ cancelled: true })
  } catch (err) {
    logger.error('[api/pharmacy/dispatch/[id]] DELETE exception', { err })
    return internalError()
  }
}