import type { APIRoute } from 'astro'
import { badRequest, conflict, forbidden, internalError, jsonOk, serviceUnavailable, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DispatchTierCategory } from '@/lib/pharmacy/pharmacy-on-demand.service'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { createGuestQueueRecoveryToken, hashGuestQueueRecoveryToken } from '@/lib/pharmacy/guest-queue-recovery'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { hasSecureGuestPaymentSecret } from '@/lib/pharmacy/payments/guest-payment-access'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { getOperationalPaymentSwitches } from '@/lib/payments/operational-switches'

const VALID_TIERS: DispatchTierCategory[] = [
  'general',
  'cardiologia',
  'salud_mental',
  'pediatria',
  'dermatologia',
  'traumatologia',
  'salud_femenina',
  'oftalmo_otorrino',
  'neumonologia',
  'gastroenterologia',
  'urologia',
  'endocrinologia',
]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return badRequest('Cuerpo de solicitud inválido')
    }

    const { patientDni, patientCpf, careCountry, patientPhone, patientName, tier, kioskId, pharmacyId, symptomSummary, referralCode } = body

    // Choose the country explicitly. A DNI/CPF or mobile dialing prefix cannot
    // determine clinical jurisdiction or grant access to an existing patient.
    if (careCountry !== 'AR' && careCountry !== 'BR') {
      return badRequest('Seleccioná Argentina o Brasil como país de atención')
    }

    // Do not send a referred Jordan patient into a clinical queue without
    // a checkout that's explicitly live and secured server-side.
    const operationalSwitches = await getOperationalPaymentSwitches(createAstroAdminClient(locals.runtime?.env)).catch(() => null)
    if (!operationalSwitches?.pharmacy_express_payments_enabled) return serviceUnavailable('pharmacy_express_payments_disabled')
    if (referralCode === 'JORDAN') {
      if (careCountry !== 'BR') return badRequest('jordan_referral_brazil_only')
      if (tier && tier !== 'general') return badRequest('jordan_general_consultation_only')
      if (!operationalSwitches.jordan_qr_payments_enabled || !hasSecureGuestPaymentSecret(locals.runtime?.env)) {
        return serviceUnavailable('jordan_checkout_not_ready')
      }
    }

    const rawDocument = careCountry === 'BR' ? (patientCpf ?? patientDni) : patientDni
    if (typeof rawDocument !== 'string' || !rawDocument.trim()) {
      return badRequest('Número de documento requerido')
    }
    const normalizedDocument = rawDocument.replace(/\D/g, '')
    if (careCountry === 'BR' ? normalizedDocument.length !== 11 : normalizedDocument.length < 5 || normalizedDocument.length > 10) {
      return badRequest(careCountry === 'BR' ? 'CPF inválido: ingresar 11 dígitos' : 'DNI inválido')
    }
    const sanitizedDni = careCountry === 'AR' ? normalizedDocument : null
    const sanitizedCpf = careCountry === 'BR' ? normalizedDocument : null

    if (!patientPhone || typeof patientPhone !== 'string') {
      return badRequest('Teléfono celular requerido')
    }
    const sanitizedPhone = patientPhone.trim().replace(/[^\d+()-\s]/g, '')
    if (sanitizedPhone.replace(/\D/g, '').length < 6 || sanitizedPhone.length > 30) {
      return badRequest('Teléfono celular inválido')
    }

    const sanitizedName = typeof patientName === 'string' && patientName.trim()
      ? patientName.trim().slice(0, 120)
      : null

    const sanitizedSymptoms = typeof symptomSummary === 'string' && symptomSummary.trim()
      ? symptomSummary.trim().slice(0, 500)
      : null

    const selectedTier: DispatchTierCategory = (typeof tier === 'string' && VALID_TIERS.includes(tier as DispatchTierCategory))
      ? (tier as DispatchTierCategory)
      : 'general'

    const supabase = createAstroAdminClient(locals.runtime?.env)

    // Native Android bearer must be verified by Supabase Auth, never parsed
    // without signature checks. Malformed or expired bearer cannot become a
    // new anonymous guest record by silently falling back.
    const authorization = request.headers.get('authorization')?.trim() ?? ''
    let mobileUserId: string | null = null
    if (authorization) {
      const match = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(authorization)
      if (!match) return unauthorized('invalid_mobile_session')
      const { data: bearerIdentity, error: bearerError } = await supabase.auth.getUser(match[1])
      if (bearerError || !bearerIdentity.user) return unauthorized('invalid_mobile_session')
      mobileUserId = bearerIdentity.user.id
    }
    const sessionUser = (locals as { user?: { id: string } }).user ?? locals.session?.user
    if (sessionUser?.id && mobileUserId && sessionUser.id !== mobileUserId) {
      return forbidden('mobile_session_conflicts_with_cookie_session')
    }
    const requestedByUserId = mobileUserId || sessionUser?.id || null

    // 2. Validar pertenencia a kiosco registrado si kioskId viene provisto
    let resolvedKioskId: string | null = null
    let resolvedPharmacyId: string | null = null

    if (kioskId) {
      if (typeof kioskId !== 'string' || !UUID_REGEX.test(kioskId.trim())) {
        return badRequest('ID de kiosco con formato inválido')
      }
      const cleanKioskId = kioskId.trim()
      const { data: kiosk, error: kioskErr } = await supabase
        .from('pharmacy_kiosks')
        .select('id, pharmacy_id, active')
        .eq('id', cleanKioskId)
        .maybeSingle()

      if (kioskErr || !kiosk) {
        return badRequest('Kiosco no registrado')
      }
      if (!kiosk.active) {
        return badRequest('El kiosco no se encuentra activo')
      }

      resolvedKioskId = kiosk.id
      if (kiosk.pharmacy_id) {
        resolvedPharmacyId = kiosk.pharmacy_id
      }
    }

    // 3. Validar pharmacyId si viene provisto
    if (pharmacyId) {
      if (typeof pharmacyId !== 'string' || !UUID_REGEX.test(pharmacyId.trim())) {
        return badRequest('ID de farmacia con formato inválido')
      }
      const cleanPharmacyId = pharmacyId.trim()

      if (resolvedPharmacyId && resolvedPharmacyId !== cleanPharmacyId) {
        return badRequest('El kiosco no pertenece a la farmacia indicada')
      }

      const { data: pharmacy, error: pharmErr } = await supabase
        .from('pharmacies')
        .select('id, active, deleted_at')
        .eq('id', cleanPharmacyId)
        .maybeSingle()

      if (pharmErr || !pharmacy?.active || pharmacy.deleted_at) {
        return badRequest('Farmacia no registrada o inválida')
      }
      resolvedPharmacyId = pharmacy.id
    }

    const context = await resolvePatientContext(request, locals)
    // Authenticated patients use their persisted jurisdiction and patient link.
    // Pharmacy QR visitors remain first-class guests with explicit country and validated identity/contact.
    if (requestedByUserId && !context) {
      return unauthorized('La sesión no corresponde a un paciente habilitado')
    }
    if (context && !context.careCountry) {
      return conflict('Selecciona tu país de atención en el portal del paciente antes de continuar')
    }
    if (context && careCountry !== context.careCountry) {
      return forbidden('patient_inactive_or_country_mismatch')
    }
    if (!sanitizedName) return badRequest('Nombre completo requerido')
    // Resolve the establishment from persisted data, never from the QR payload.
    if (resolvedPharmacyId) {
      const { data: origin, error: originError } = await supabase.from('pharmacies')
        .select('id, active, deleted_at').eq('id', resolvedPharmacyId).maybeSingle()
      if (originError) return internalError()
      if (!origin?.active || origin.deleted_at) {
        return forbidden('La farmacia del QR no está activa. Usa el acceso de una farmacia adherida')
      }
    } else if (resolvedKioskId) {
      return forbidden('kiosk_country_not_configured')
    }

    // Jordan is a Brazil-only commercial referral source, never an Argentina channel.
    // Reject before registration so AR requests cannot contaminate partner reporting.
    if (referralCode === 'JORDAN' && careCountry !== 'BR') {
      return badRequest('jordan_referral_brazil_only')
    }

    // Attribution only at creation time, resolving the QR code on the server.
    // Never trust a client-submitted partner ID or pharmacy ID as commercial proof.
    let referralPartnerId: string | null = null
    if (referralCode != null) {
      if (typeof referralCode !== 'string' || !/^[A-Z0-9_-]{3,32}$/.test(referralCode)) {
        return badRequest('referral_code_invalid')
      }
      const { data: partner, error: referralError } = await (supabase as unknown as SupabaseClient)
        .from('commercial_referral_partners')
        .select('id')
        .eq('code', referralCode)
        .eq('active', true)
        .maybeSingle()
      if (referralError) {
        logger.error('[api/pharmacy/dispatch/request] referral_lookup_failed', {
          code: typeof referralError.code === 'string' ? referralError.code : 'INTERNAL',
        })
        return serviceUnavailable('referral_lookup_unavailable')
      }
      if (!partner) return badRequest('referral_code_not_found')
      referralPartnerId = partner.id
    }

    const cloudflareRoomId = `cf-room-${selectedTier}-${crypto.randomUUID()}`

     const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) {
      logger.error('[api/pharmacy/dispatch/request] GUEST_TOKEN_SECRET not configured')
      return serviceUnavailable('guest_token_not_configured')
    }

    const insertPayload = {
      care_country: context?.careCountry ?? careCountry,
      patient_id: context?.patientId ?? null,
      patient_dni: sanitizedDni,
      patient_cpf: sanitizedCpf,
      patient_phone: sanitizedPhone,
      patient_name: sanitizedName,
      tier_requested: selectedTier,
      kiosk_id: resolvedKioskId,
      pharmacy_id: resolvedPharmacyId,
      referral_partner_id: referralPartnerId,
      symptom_summary: sanitizedSymptoms,
      cloudflare_room_id: cloudflareRoomId,
      status: 'searching' as const,
      requested_by_user_id: context?.userId ?? null,
    }

    const { data, error } = await supabase
      .from('pharmacy_dispatch_requests')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) {
      if (error.code === '42501' && error.message.includes('care_country')) {
        return forbidden('care_country_required_or_mismatched')
      }
      // Database errors may include failing rows with DNI/CPF, symptoms or PHI.
      logger.error('[api/pharmacy/dispatch/request] insertion_failed', {
        code: typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'INTERNAL',
      })
      return internalError('dispatch_request_failed')
    }

    // Generar token de acceso criptográfico (JWT firmado con HS256)
    const accessToken = await signGuestToken(
      {
        callId: data.id,
        roomId: cloudflareRoomId,
        guestName: (data.patient_name?.trim() || 'Paciente Kiosco').trim(),
      },
      secret,
    )

    // Browser guests and authenticated native patients require a stable
    // recovery secret to survive app process death. The resume endpoint must
    // check both bearer user and scoped secret for authenticated native users.
    let recoveryToken: string | null = null
    if (!requestedByUserId || mobileUserId) {
      recoveryToken = createGuestQueueRecoveryToken()
      const digest = await hashGuestQueueRecoveryToken(recoveryToken)
      const { error: recoveryError } = await (supabase as unknown as SupabaseClient)
        .from('pharmacy_guest_dispatch_sessions')
        .insert({ request_id: data.id, token_sha256: digest })

      if (recoveryError) {
        logger.error('[api/pharmacy/dispatch/request] recovery_session_creation_failed', {
          code: recoveryError.code ?? 'INTERNAL',
        })
        // Never strand an anonymous request without a way to recover it.
        await supabase.from('pharmacy_dispatch_requests')
          .update({ status: 'cancelled' })
          .eq('id', data.id)
          .eq('status', 'searching')
        return serviceUnavailable('guest_queue_recovery_unavailable')
      }
    }

    return jsonOk({
      request: data,
      cloudflare_room_id: cloudflareRoomId,
      accessToken,
      ...(recoveryToken ? { recoveryToken } : {}),
    })
  } catch (error) {
    // Keep clinical payloads out of logs while preserving a safe stack hint
    // for diagnosing unexpected server-side failures.
    logger.error('[api/pharmacy/dispatch/request] unexpected_failure', {
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4).join('\n') : undefined,
    })
    return internalError('dispatch_request_failed')
  }
}

