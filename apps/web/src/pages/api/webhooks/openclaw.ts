/**
 * Webhook endpoint para recibir respuestas de pacientes vía OpenClaw (WhatsApp/Telegram).
 *
 * OpenClaw POST → este endpoint cuando un paciente responde a un recordatorio.
 * Parsea la respuesta ("CONFIRMO", "CANCELO", "ACEPTO") y actualiza la cita.
 *
 * Auth: Bearer token (server-to-server, no requiere session de usuario).
 */
import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import {
  parsePatientResponse,
  processReminderResponse,

  processWaitlist,
  acceptWaitlistOffer,
} from '@autamedica/scheduling'

const WEBHOOK_SECRET = import.meta.env.OPENCLAW_WEBHOOK_SECRET ?? ''

interface OpenClawWebhookPayload {
  /** Número de teléfono del remitente (E.164) */
  from: string
  /** Mensaje del paciente */
  message: string
  /** Canal (whatsapp, telegram, etc) */
  channel?: string
  /** Timestamp del mensaje */
  timestamp?: string
}

export const POST: APIRoute = async ({ request }) => {
  // Validate webhook secret
  const authHeader = request.headers.get('Authorization')
  if (!WEBHOOK_SECRET || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: OpenClawWebhookPayload
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { from, message } = body
  if (!from || !message) {
    return new Response(JSON.stringify({ error: 'Missing from or message' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = parsePatientResponse(message)
  if (!response) {
    // Mensaje no reconocido — ignorar silenciosamente
    return new Response(JSON.stringify({ ok: true, action: 'ignored' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createAstroAdminClient()

  try {
    if (response === 'accepted') {
      // Waitlist acceptance: buscar oferta activa para este teléfono
      const result = await handleWaitlistAcceptance(supabase, from)
      return jsonOk({ action: 'waitlist_accepted', ...result })
    }

    // confirmed/cancelled: buscar el reminder más reciente enviado a este teléfono
    const reminder = await findActiveReminderByPhone(supabase, from)
    if (!reminder) {
      logger.warn(`[openclaw-webhook] No active reminder found for ${from}`)
      return jsonOk({ action: 'no_reminder_found' })
    }

    await processReminderResponse(supabase, reminder.id, response)

    // Si canceló, activar waitlist para el slot liberado
    if (response === 'cancelled' && reminder.appointment_id) {
      const { data: appt } = await supabase
        .from('appointments')
        .select('doctor_id, start_time, end_time')
        .eq('id', reminder.appointment_id)
        .single()

      if (appt?.start_time && appt?.end_time) {
        await processWaitlist(supabase, appt.doctor_id, {
          date: appt.start_time.split('T')[0],
          start_time: appt.start_time,
          end_time: appt.end_time,
        }).catch((err) => logger.error('[openclaw-webhook] processWaitlist failed', err))
      }
    }

    return jsonOk({ action: response, reminder_id: reminder.id })
  } catch (err) {
    logger.error('[openclaw-webhook] Error processing response', err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

// OPTIONS for CORS preflight
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  })
}

// ── Helpers ──

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Busca el reminder más reciente enviado (status='sent') al teléfono dado,
 * cuya cita aún esté activa (no cancelled/completed).
 */
async function findActiveReminderByPhone(
  supabase: ReturnType<typeof createAstroAdminClient>,
  phone: string,
) {
  // Buscar paciente por teléfono → sus citas → sus reminders enviados
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('phone', phone)
    .limit(1)

  if (!profiles?.length) return null

  const userId = profiles[0].user_id

  // Buscar patient_id del user
  const { data: patients } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .limit(1)

  if (!patients?.length) return null

  const patientId = patients[0].id

  // Buscar citas activas del paciente
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .in('status', ['scheduled', 'confirmed'])
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })

  if (!appointments?.length) return null

  const appointmentIds = appointments.map((a) => a.id)

  // Buscar reminder enviado más reciente para alguna de esas citas
  const { data: reminders } = await supabase
    .from('appointment_reminders')
    .select('id, appointment_id')
    .in('appointment_id', appointmentIds)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)

  return reminders?.[0] ?? null
}

/**
 * Maneja la aceptación de una oferta de waitlist.
 * Busca la oferta activa (status='offered') para el teléfono dado.
 */
async function handleWaitlistAcceptance(
  supabase: ReturnType<typeof createAstroAdminClient>,
  phone: string,
) {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('phone', phone)
    .limit(1)

  if (!profiles?.length) throw new Error('Patient not found for phone')

  const { data: patients } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', profiles[0].user_id)
    .eq('active', true)
    .limit(1)

  if (!patients?.length) throw new Error('Patient record not found')

  const { data: offers } = await supabase
    .from('appointment_waitlist')
    .select('*')
    .eq('patient_id', patients[0].id)
    .eq('status', 'offered')
    .gt('expires_at', new Date().toISOString())
    .order('offered_at', { ascending: false })
    .limit(1)

  if (!offers?.length) throw new Error('No active waitlist offer found')

  const offer = offers[0]

  // Necesitamos el slot que se liberó — está implícito en la oferta
  // Por ahora usamos preferred_date_start/time como aproximación
  const result = await acceptWaitlistOffer(supabase, offer.id, {
    start_time: offer.preferred_date_start ?? new Date().toISOString(),
    end_time: offer.preferred_date_end ?? new Date().toISOString(),
    type: offer.appointment_type ?? undefined,
  })

  return { appointment_id: result.appointment_id, waitlist_id: offer.id }
}
