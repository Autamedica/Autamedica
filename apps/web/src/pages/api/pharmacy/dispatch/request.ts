import type { APIRoute } from 'astro'
import { badRequest, forbidden, internalError, jsonOk, serviceUnavailable } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { generateCloudflareRoomId, type DispatchTierCategory } from '@/lib/pharmacy/pharmacy-on-demand.service'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { logger } from '@autamedica/shared'

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

    const { patientDni, patientPhone, patientName, tier, kioskId, pharmacyId, symptomSummary } = body

    // 1. Validar campos mínimos obligatorios y sanitizar
    if (!patientDni || typeof patientDni !== 'string') {
      return badRequest('Número de documento requerido')
    }
    const sanitizedDni = patientDni.trim().replace(/[^\w.-]/g, '')
    if (sanitizedDni.length < 5 || sanitizedDni.length > 20) {
      return badRequest('Número de documento inválido')
    }

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
        .select('id')
        .eq('id', cleanPharmacyId)
        .maybeSingle()

      if (pharmErr || !pharmacy) {
        return badRequest('Farmacia no registrada o inválida')
      }
      resolvedPharmacyId = pharmacy.id
    }

    const cloudflareRoomId = generateCloudflareRoomId(selectedTier, sanitizedDni)

    // Asociar usuario dueño si la petición proviene de un usuario autenticado
    const sessionUser = (locals as { user?: { id: string } }).user ?? locals.session?.user
    const requestedByUserId = sessionUser?.id || null

    const insertPayload = {
      patient_dni: sanitizedDni,
      patient_phone: sanitizedPhone,
      patient_name: sanitizedName,
      tier_requested: selectedTier,
      kiosk_id: resolvedKioskId,
      pharmacy_id: resolvedPharmacyId,
      symptom_summary: sanitizedSymptoms,
      cloudflare_room_id: cloudflareRoomId,
      status: 'searching' as const,
      requested_by_user_id: requestedByUserId,
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
      logger.error('[api/pharmacy/dispatch/request] Error inserting request', { error })
      return internalError(error.message)
    }

    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) {
      logger.error('[api/pharmacy/dispatch/request] GUEST_TOKEN_SECRET not configured')
      return serviceUnavailable('guest_token_not_configured')
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

    return jsonOk({
      request: data,
      cloudflare_room_id: cloudflareRoomId,
      accessToken,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado'
    logger.error('[api/pharmacy/dispatch/request] Exception', { err })
    return internalError(message)
  }
}

