/**
 * Edge Function: process-reminders
 *
 * Procesa recordatorios pendientes de citas y los envía vía OpenClaw (WhatsApp).
 * También:
 * - reintenta reminders fallidos con backoff
 * - despacha ofertas de waitlist no enviadas
 * - expira ofertas vencidas
 * - marca citas vencidas como no_show
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const OPENCLAW_URL = Deno.env.get('OPENCLAW_URL') ?? 'http://127.0.0.1:18789'
const OPENCLAW_TOKEN = Deno.env.get('OPENCLAW_TOKEN') ?? ''
const OPENCLAW_ACCOUNT = Deno.env.get('OPENCLAW_ACCOUNT') ?? 'autamedica'
const DRY_RUN = Deno.env.get('REMINDER_DRY_RUN') === 'true'
const BATCH_SIZE = 50
const MAX_REMINDER_RETRIES = 3
const BASE_RETRY_MINUTES = 5
const MAX_RETRY_MINUTES = 60

// deno-lint-ignore no-explicit-any -- this function uses dynamic PostgREST selects without generated database types.
type ReminderSupabaseClient = ReturnType<typeof createClient<any>>

interface WorkerResult {
  processed: number
  sent: number
  failed: number
  waitlistOffersSent: number
  waitlistExpired: number
  noShowsMarked: number
  errors: string[]
}

interface Reminder {
  id: string
  appointment_id: string
  channel: string
  scheduled_for: string
  retry_count?: number | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const authHeader = req.headers.get('Authorization')
  const expectedToken = Deno.env.get('CRON_SECRET') ?? ''

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const result: WorkerResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    waitlistOffersSent: 0,
    waitlistExpired: 0,
    noShowsMarked: 0,
    errors: [],
  }

  try {
    const now = new Date().toISOString()
    const { data: reminders, error: fetchErr } = await supabase
      .from('appointment_reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order('scheduled_for', { ascending: true })
      .limit(BATCH_SIZE)

    if (fetchErr) throw new Error(`Fetch reminders: ${fetchErr.message}`)

    result.processed = reminders?.length ?? 0

    for (const reminder of reminders ?? []) {
      try {
        await processOneReminder(supabase, reminder as Reminder)
        result.sent++
      } catch (err) {
        result.failed++
        const msg = err instanceof Error ? err.message : 'Unknown'
        result.errors.push(`${(reminder as Reminder).id}: ${msg}`)
        await scheduleReminderRetry(supabase, reminder as Reminder, msg)
      }
    }

    const waitlistDispatch = await processUnsentWaitlistOffers(supabase)
    result.waitlistOffersSent = waitlistDispatch.sent
    result.errors.push(...waitlistDispatch.errors.map((err) => `Waitlist: ${err}`))

    const { data: expired } = await supabase
      .from('appointment_waitlist')
      .update({ status: 'expired' })
      .eq('status', 'offered')
      .lt('expires_at', now)
      .select('id')

    result.waitlistExpired = expired?.length ?? 0

    const { data: noShowCount, error: noShowErr } = await supabase.rpc('mark_overdue_appointments_no_show')
    if (noShowErr) {
      result.errors.push(`No-show reaper: ${noShowErr.message}`)
    } else {
      result.noShowsMarked = typeof noShowCount === 'number' ? noShowCount : 0
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Cycle failed')
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

async function processOneReminder(
  supabase: ReminderSupabaseClient,
  reminder: Reminder,
): Promise<void> {
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select(`
      id, start_time, type, status, location,
      patients!inner(id, user_id, profiles:profiles!inner(first_name, last_name, phone)),
      doctors!inner(id, user_id, profiles:profiles!inner(first_name, last_name))
    `)
    .eq('id', reminder.appointment_id)
    .single()

  if (apptErr || !appt) throw new Error(`Appointment ${reminder.appointment_id} not found`)

  if (appt.status === 'cancelled' || appt.status === 'no_show' || appt.status === 'completed') {
    await markReminderSent(supabase, reminder.id)
    return
  }

  const patient = (appt as Record<string, unknown>).patients as Record<string, unknown> | null
  const doctor = (appt as Record<string, unknown>).doctors as Record<string, unknown> | null
  const patientProfile = patient?.profiles as Record<string, string> | null
  const doctorProfile = doctor?.profiles as Record<string, string> | null
  const phone = patientProfile?.phone

  if (!phone) throw new Error('Patient has no phone')

  const startTime = new Date(appt.start_time as string)
  const hoursUntil = (startTime.getTime() - Date.now()) / (1000 * 60 * 60)
  const patientName = patientProfile?.first_name ?? 'Paciente'
  const doctorName = [doctorProfile?.first_name, doctorProfile?.last_name].filter(Boolean).join(' ') || 'Doctor'
  const dateStr = startTime.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeStr = startTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const apptType = (appt.type as string) ?? 'Consulta'
  const location = appt.location as string | null

  const message = hoursUntil > 6
    ? buildReminder24h(patientName, doctorName, dateStr, timeStr, apptType, location)
    : buildReminder2h(patientName, doctorName, timeStr, location)

  if (DRY_RUN) {
    console.log(`[DRY RUN] reminder ${reminder.id} -> ${phone}: ${message.substring(0, 80)}...`)
    await markReminderSent(supabase, reminder.id)
    return
  }

  const res = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
    },
    body: JSON.stringify({
      agentId: OPENCLAW_ACCOUNT,
      message: `Envía este mensaje exacto al paciente, sin modificar nada:\n\n${message}`,
      deliver: true,
      channel: reminder.channel === 'whatsapp' ? 'whatsapp' : reminder.channel,
      to: phone,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenClaw HTTP ${res.status}: ${text}`)
  }

  await markReminderSent(supabase, reminder.id)
}

async function processUnsentWaitlistOffers(
  supabase: ReminderSupabaseClient,
): Promise<{ sent: number; errors: string[] }> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('appointment_waitlist')
    .select(`
      id,
      expires_at,
      offered_at,
      offered_start_time,
      offer_sent_at,
      patients!inner(id, user_id, profiles:profiles!inner(first_name, phone)),
      doctors!inner(id, user_id, profiles:profiles!inner(first_name, last_name))
    `)
    .eq('status', 'offered')
    .is('offer_sent_at', null)
    .gt('expires_at', now)
    .order('offered_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    throw new Error(`Fetch waitlist offers: ${error.message}`)
  }

  const result = { sent: 0, errors: [] as string[] }

  for (const rawOffer of data ?? []) {
    const offer = rawOffer as Record<string, unknown>
    const patient = offer.patients as Record<string, unknown> | null
    const doctor = offer.doctors as Record<string, unknown> | null
    const patientProfile = patient?.profiles as Record<string, string> | null
    const doctorProfile = doctor?.profiles as Record<string, string> | null
    const phone = patientProfile?.phone
    const offeredStartTime = offer.offered_start_time as string | null

    if (!phone) {
      result.errors.push(`Offer ${offer.id as string}: patient phone missing`)
      continue
    }

    if (!offeredStartTime) {
      result.errors.push(`Offer ${offer.id as string}: offered_start_time missing`)
      continue
    }

    const startsAt = new Date(offeredStartTime)
    const message = buildWaitlistOffer({
      patientName: patientProfile?.first_name ?? 'Paciente',
      doctorName: [doctorProfile?.first_name, doctorProfile?.last_name].filter(Boolean).join(' ') || 'Doctor',
      date: startsAt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }),
      time: startsAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      expiresIn: formatExpiryWindow(offer.expires_at as string | null),
    })

    if (DRY_RUN) {
      await supabase
        .from('appointment_waitlist')
        .update({ offer_sent_at: new Date().toISOString() })
        .eq('id', offer.id as string)
      result.sent++
      continue
    }

    const res = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      },
      body: JSON.stringify({
        agentId: OPENCLAW_ACCOUNT,
        message: `Envía este mensaje exacto al paciente, sin modificar nada:\n\n${message}`,
        deliver: true,
        channel: 'whatsapp',
        to: phone,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text()
      result.errors.push(`Offer ${offer.id as string}: OpenClaw HTTP ${res.status}: ${text}`)
      continue
    }

    await supabase
      .from('appointment_waitlist')
      .update({ offer_sent_at: new Date().toISOString() })
      .eq('id', offer.id as string)

    result.sent++
  }

  return result
}

async function scheduleReminderRetry(
  supabase: ReminderSupabaseClient,
  reminder: Reminder,
  errorMessage: string,
) {
  const nextAttempt = (reminder.retry_count ?? 0) + 1
  const exhausted = nextAttempt >= MAX_REMINDER_RETRIES
  const nextRetryAt = exhausted
    ? null
    : new Date(
      Date.now() + Math.min(BASE_RETRY_MINUTES * 2 ** Math.max(nextAttempt - 1, 0), MAX_RETRY_MINUTES) * 60 * 1000,
    ).toISOString()

  await supabase
    .from('appointment_reminders')
    .update({
      status: exhausted ? 'failed' : 'pending',
      retry_count: nextAttempt,
      next_retry_at: nextRetryAt,
      last_error: errorMessage,
    })
    .eq('id', reminder.id)
}

async function markReminderSent(
  supabase: ReminderSupabaseClient,
  id: string,
) {
  await supabase
    .from('appointment_reminders')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      next_retry_at: null,
      last_error: null,
    })
    .eq('id', id)
}

function formatExpiryWindow(expiresAt: string | null): string {
  if (!expiresAt) return 'unas horas'
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return 'muy poco tiempo'
  const totalMinutes = Math.max(1, Math.round(diffMs / 60000))
  if (totalMinutes < 60) return `${totalMinutes} minutos`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours} horas` : `${hours}h ${minutes}m`
}

function buildReminder24h(
  patient: string,
  doctor: string,
  date: string,
  time: string,
  type: string,
  location: string | null,
): string {
  const loc = location ? `📍 *Ubicación:* ${location}` : `💻 *Modalidad:* Telemedicina`
  return [
    `🏥 *Recordatorio de turno — AutaMedica*`, '',
    `Hola ${patient}, te recordamos que tenés turno mañana:`, '',
    `👨‍⚕️ *Doctor:* ${doctor}`,
    `📅 *Fecha:* ${date}`,
    `🕐 *Hora:* ${time}`,
    `📋 *Tipo:* ${type}`,
    loc, '',
    `Respondé:`,
    `✅ *CONFIRMO* — para confirmar asistencia`,
    `❌ *CANCELO* — para cancelar el turno`, '',
    `_Si no respondés, el turno se mantiene agendado._`,
  ].join('\n')
}

function buildReminder2h(patient: string, doctor: string, time: string, location: string | null): string {
  return [
    `⏰ *Turno en 2 horas*`, '',
    `${patient}, tu turno con Dr. ${doctor} es a las ${time}.`,
    location ? `📍 ${location}` : `💻 Ingresá a autamedica.com para la videollamada.`,
  ].join('\n')
}

function buildWaitlistOffer(data: {
  patientName: string
  doctorName: string
  date: string
  time: string
  expiresIn: string
}): string {
  return [
    `🔔 *Turno disponible — AutaMedica*`,
    ``,
    `Hola ${data.patientName}, se liberó un turno:`,
    ``,
    `👨‍⚕️ Dr. ${data.doctorName}`,
    `📅 ${data.date} a las ${data.time}`,
    ``,
    `⏳ Tenés ${data.expiresIn} para responder.`,
    ``,
    `Respondé *ACEPTO* para reservar el turno.`,
  ].join('\n')
}
