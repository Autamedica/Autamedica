import type { APIRoute } from 'astro'
import { badRequest, internalError, jsonOk, serviceUnavailable } from '@/lib/api-helpers'
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

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return badRequest('Cuerpo de solicitud inválido')
    }

    const { patientDni, patientPhone, patientName, tier, kioskId, pharmacyId, symptomSummary } = body

    if (!patientDni || typeof patientDni !== 'string' || patientDni.trim().length < 5) {
      return badRequest('Número de documento inválido')
    }

    if (!patientPhone || typeof patientPhone !== 'string' || patientPhone.trim().length < 6) {
      return badRequest('Teléfono celular inválido')
    }

    const selectedTier: DispatchTierCategory = VALID_TIERS.includes(tier) ? tier : 'general'
    const cloudflareRoomId = generateCloudflareRoomId(selectedTier, patientDni)

    const supabase = createAstroAdminClient(locals.runtime?.env)

    const insertPayload = {
      patient_dni: patientDni.trim(),
      patient_phone: patientPhone.trim(),
      patient_name: patientName?.trim() || null,
      tier_requested: selectedTier,
      kiosk_id: kioskId || null,
      pharmacy_id: pharmacyId || null,
      symptom_summary: symptomSummary || null,
      cloudflare_room_id: cloudflareRoomId,
      status: 'searching' as const,
    }

    const { data, error } = await supabase
      .from('pharmacy_dispatch_requests')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) {
      logger.error('[api/pharmacy/dispatch/request] Error inserting request', { error })
      return internalError(error.message)
    }

    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) {
      logger.error('[api/pharmacy/dispatch/request] GUEST_TOKEN_SECRET not configured')
      return serviceUnavailable('guest_token_not_configured')
    }

    // Mint guest access token so the kiosk can join the Cloudflare Calls room
    // via the same guest media plane used by invite-based calls.
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
