/**
 * Service: pharmacy-on-demand.service.ts
 * Description: Ecosistema On-Demand de Atención Médica ("Uber para Médicos").
 * Principio: Single-Scroll 1-Toque y Cloudflare Calls WebRTC SFU (ADR-0003).
 */

import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'

export type DispatchTierCategory =
  | 'general'
  | 'cardiologia'
  | 'salud_mental'
  | 'pediatria'
  | 'dermatologia'
  | 'traumatologia'
  | 'salud_femenina'
  | 'oftalmo_otorrino'
  | 'neumonologia'
  | 'gastroenterologia'
  | 'urologia'
  | 'endocrinologia'

export type DispatchRequestStatus =
  | 'searching'
  | 'matched'
  | 'in_call'
  | 'transferring'
  | 'transferred'
  | 'completed'
  | 'cancelled'
  | 'expired'

export interface TierDefinition {
  id: DispatchTierCategory
  icon: string
  name: string
  subtitle: string
  symptoms: string[]
  defaultWaitText: string
  isPopularDefault?: boolean
}

export const DISPATCH_TIERS: TierDefinition[] = [
  {
    id: 'general',
    icon: '🩺',
    name: 'Médico Ahora (Clínica / Guardia)',
    subtitle: 'Fiebre, dolor, malestar general, recetas y triaje',
    symptoms: ['Fiebre', 'Recetas', 'Gripe', 'Malestar general'],
    defaultWaitText: '< 2 min',
    isPopularDefault: true,
  },
  {
    id: 'cardiologia',
    icon: '🫀',
    name: 'Corazón & Presión',
    subtitle: 'Tensión alta, palpitaciones, opresión torácica',
    symptoms: ['Pico de presión', 'Palpitaciones', 'Dolor en pecho'],
    defaultWaitText: '~4 min',
  },
  {
    id: 'salud_mental',
    icon: '🧠',
    name: 'Salud Mental & Apoyo',
    subtitle: 'Crisis de angustia, ataque de pánico, insomnio agudo',
    symptoms: ['Ataque de pánico', 'Angustia', 'Insomnio severo'],
    defaultWaitText: '~5 min',
  },
  {
    id: 'pediatria',
    icon: '👶',
    name: 'Pediatría Inmediata',
    subtitle: 'Bebés y niños, fiebre infantil, pautas de alarma',
    symptoms: ['Fiebre en lactantes', 'Mocos y tos', 'Vómitos'],
    defaultWaitText: '~3 min',
  },
  {
    id: 'dermatologia',
    icon: '🧴',
    name: 'Piel & Alergias',
    subtitle: 'Erupciones súbitas, picaduras, quemaduras leves',
    symptoms: ['Ronchas / Urticaria', 'Picaduras', 'Quemaduras'],
    defaultWaitText: '~4 min',
  },
  {
    id: 'traumatologia',
    icon: '🦴',
    name: 'Huesos & Dolores',
    subtitle: 'Torceduras, lumbalgia aguda, contracturas, golpes',
    symptoms: ['Esguince / Torcedura', 'Lumbalgia aguda', 'Golpe'],
    defaultWaitText: '~5 min',
  },
  {
    id: 'salud_femenina',
    icon: '🌸',
    name: 'Salud de la Mujer',
    subtitle: 'Anticoncepción de emergencia, cistitis, cólicos',
    symptoms: ['Anticoncepción postcoital', 'Ardor al orinar', 'Cólicos'],
    defaultWaitText: '~5 min',
  },
  {
    id: 'oftalmo_otorrino',
    icon: '👁️',
    name: 'Ojos, Oídos & Garganta',
    subtitle: 'Conjuntivitis, dolor de oído punzante, faringitis',
    symptoms: ['Ojo rojo / Secreción', 'Otitis', 'Dolor de garganta'],
    defaultWaitText: '~4 min',
  },
  {
    id: 'neumonologia',
    icon: '🫁',
    name: 'Pulmones & Respiratorio',
    subtitle: 'Crisis de asma, broncoespasmo, tos persistente',
    symptoms: ['Falta de aire leve', 'Tos con silbido', 'Disnea'],
    defaultWaitText: '~5 min',
  },
  {
    id: 'gastroenterologia',
    icon: '🫄',
    name: 'Estómago & Digestión',
    subtitle: 'Acidez severa, diarrea aguda, gastroenteritis',
    symptoms: ['Vómitos continuos', 'Acidez quemante', 'Diarrea'],
    defaultWaitText: '~6 min',
  },
  {
    id: 'urologia',
    icon: '💧',
    name: 'Riñones & Vías Urinarias',
    subtitle: 'Infección urinaria recurrente, dolor lumbar cólico',
    symptoms: ['Molestia al orinar', 'Dolor lumbar en flanco'],
    defaultWaitText: '~6 min',
  },
  {
    id: 'endocrinologia',
    icon: '🦋',
    name: 'Tiroides & Hormonas',
    subtitle: 'Ajuste de dosis levotiroxina, dudas metabólicas',
    symptoms: ['Ajuste medicación', 'Dudas tiroideas'],
    defaultWaitText: '~6 min',
  },
]

export interface DispatchRequest {
  id: string
  kiosk_id: string | null
  pharmacy_id: string | null
  patient_dni: string
  patient_phone: string
  patient_name: string | null
  tier_requested: DispatchTierCategory
  symptom_summary: string | null
  status: DispatchRequestStatus
  assigned_doctor_id: string | null
  previous_doctor_id: string | null
  cloudflare_room_id: string
  created_at: string
  matched_at: string | null
  call_started_at: string | null
  call_ended_at: string | null
  doctor?: {
    full_name: string
    license_number: string
    specialty: string
  } | null
}

export interface DutyDoctorsSummary {
  [tier: string]: {
    online_count: number
    free_count: number
  }
}

export interface DispatchDoctorInfo {
  full_name: string
  license_number: string
  specialty: string
}

/**
 * Cálculo del ETA dinámico en minutos y texto visible bajo sol
 */
export function computeTierWaitTime(
  doctorsFree: number,
  doctorsOnDuty: number,
  queuedRequests: number = 0,
  avgConsultMinutes: number = 8
): { minutes: number; text: string } {
  if (doctorsFree > 0) {
    return { minutes: 1.5, text: '< 2 min' }
  }
  if (doctorsOnDuty > 0) {
    const wait = Math.ceil(((queuedRequests + 1) * avgConsultMinutes) / doctorsOnDuty)
    const clamped = Math.max(3, wait)
    return { minutes: clamped, text: `~${clamped} min` }
  }
  return { minutes: 1.0, text: 'Clínico disponible (< 1 min)' }
}

/**
 * Generate an opaque room identifier. DNI/CPF, even the last four digits,
 * must never appear in video URLs, logs or room names.
 */
export function generateCloudflareRoomId(tier: DispatchTierCategory, _document: string): string {
  const opaque = crypto.randomUUID().replace(/-/g, '')
  const timestamp = Date.now().toString(36)
  return `cf-room-${tier}-${opaque.slice(0, 12)}-${timestamp}-${opaque.slice(12, 20)}`
}

/**
 * Crea una nueva solicitud de despacho on-demand.
 *
 * Pasa por la API route server-side (POST /api/pharmacy/dispatch/request) para
 * que el backend firme el guest token de Cloudflare Calls y devuelva el
 * `accessToken` que el kiosco necesita para unirse a la sala.
 */
export async function createPharmacyDispatchRequest(payload: {
  careCountry: 'AR' | 'BR'
  patientDni: string
  patientPhone: string
  patientName?: string
  tier: DispatchTierCategory
  kioskId?: string
  pharmacyId?: string
  symptomSummary?: string
}): Promise<{
  success: boolean
  data?: DispatchRequest
  accessToken?: string
  error?: string
}> {
  try {
    const data = await fetchApi<{
      request: DispatchRequest
      cloudflare_room_id: string
      accessToken: string
    }>('/api/pharmacy/dispatch/request', {
      method: 'POST',
      body: {
        careCountry: payload.careCountry,
        ...(payload.careCountry === 'BR'
          ? { patientCpf: payload.patientDni.replace(/\D/g, '') }
          : { patientDni: payload.patientDni.replace(/\D/g, '') }),
        patientPhone: payload.patientPhone.trim(),
        patientName: payload.patientName?.trim() || undefined,
        tier: payload.tier,
        kioskId: payload.kioskId,
        pharmacyId: payload.pharmacyId,
        symptomSummary: payload.symptomSummary,
      },
    })

    return { success: true, data: data.request, accessToken: data.accessToken }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado al crear la solicitud'
    logger.error('[createPharmacyDispatchRequest] Exception', { err })
    return { success: false, error: message }
  }
}

/**
 * Consulta el estado actual de una solicitud de despacho
 */
export async function getPharmacyDispatchRequest(requestId: string): Promise<DispatchRequest | null> {
  try {
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase
      .from('pharmacy_dispatch_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return data as DispatchRequest
  } catch {
    return null
  }
}

/**
 * Consulta una solicitud de despacho con la identidad real del médico asignado.
 * Resuelto server-side (admin) porque `profiles` no es legible por anon.
 */
export async function getPharmacyDispatchRequestWithDoctor(requestId: string): Promise<{
  request: DispatchRequest | null
  doctor: DispatchDoctorInfo | null
}> {
  try {
    const data = await fetchApi<{ request: DispatchRequest; doctor: DispatchDoctorInfo | null }>(
      `/api/pharmacy/dispatch/${encodeURIComponent(requestId)}`
    )
    return { request: data.request, doctor: data.doctor }
  } catch (err) {
    logger.error('[getPharmacyDispatchRequestWithDoctor] Fetch failed', { err })
    return { request: null, doctor: null }
  }
}

/**
 * Marca una consulta on-demand como finalizada desde el kiosco
 */
export async function finishPharmacyDispatchRequest(
  requestId: string,
  blob: { call_ended_at: string }
): Promise<boolean> {
  try {
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase
      .from('pharmacy_dispatch_requests')
      .update({ status: 'completed' as DispatchRequestStatus, ...blob })
      .eq('id', requestId)

    if (error) {
      logger.error('[finishPharmacyDispatchRequest] Error updating request', { error })
      return false
    }
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado'
    logger.error('[finishPharmacyDispatchRequest] Exception', { err, message })
    return false
  }
}

/**
 * Obtiene el resumen de médicos en servicio por tier
 */
export async function fetchDutyDoctorsSummary(): Promise<DutyDoctorsSummary> {
  try {
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase.rpc('get_duty_doctors_summary')

    if (error || !data) {
      return {}
    }

    return data as DutyDoctorsSummary
  } catch {
    return {}
  }
}

/**
 * Suscripción en tiempo real a una solicitud de despacho
 */
export function subscribeToDispatchRequest(
  requestId: string,
  onUpdate: (request: DispatchRequest) => void
): () => void {
  const supabase = getBrowserSupabaseClient()

  const channel = supabase
    .channel(`dispatch_request:${requestId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'pharmacy_dispatch_requests',
        filter: `id=eq.${requestId}`,
      },
      (payload) => {
        onUpdate(payload.new as DispatchRequest)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
