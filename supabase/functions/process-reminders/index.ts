/**
 * Edge Function: process-reminders
 *
 * Procesa recordatorios pendientes de citas y los envía vía OpenClaw (WhatsApp).
 * Diseñado para ejecutarse como cron cada minuto vía pg_cron o invocación externa.
 *
 * También expira ofertas de waitlist vencidas.
 *
 * Invocación:
 *   POST /functions/v1/process-reminders
 *   Header: Authorization: Bearer <SUPABASE_ANON_KEY> (o service_role para cron)
 *
 * pg_cron setup:
 *   SELECT cron.schedule('process-reminders', '* * * * *',
 *     $$SELECT net.http_post(
 *       url := '<SUPABASE_URL>/functions/v1/process-reminders',
 *       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
 *       body := '{}'::jsonb
 *     )$$
 *   );
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const OPENCLAW_URL = Deno.env.get('OPENCLAW_URL') ?? 'http://127.0.0.1:18789'
const OPENCLAW_TOKEN = Deno.env.get('OPENCLAW_TOKEN') ?? ''
const OPENCLAW_ACCOUNT = Deno.env.get('OPENCLAW_ACCOUNT') ?? 'autamedica'
const DRY_RUN = Deno.env.get('REMINDER_DRY_RUN') === 'true'
const BATCH_SIZE = 50

interface WorkerResult {
  processed: number
  sent: number
  failed: number
  waitlistExpired: number
  errors: string[]
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

  const result: WorkerResult = { processed: 0, sent: 0, failed: 0, waitlistExpired: 0, errors: [] }

  try {
    // 1. Fetch pending reminders ready to send
    const now = new Date().toISOString()
    const { data: reminders, error: fetchErr } = await supabase
      .from('appointment_reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(BATCH_SIZE)

    if (fetchErr) throw new Error(`Fetch reminders: ${fetchErr.message}`)

    result.processed = reminders?.length ?? 0

    // 2. Process each reminder
    for (const reminder of reminders ?? []) {
      try {
        await processOneReminder(supabase, reminder)
        result.sent++
      } catch (err) {
        result.failed++
        const msg = err instanceof Error ? err.message : 'Unknown'
        result.errors.push(`${reminder.id}: ${msg}`)
        // Mark as failed
        await supabase
          .from('appointment_reminders')
          .update({ status: 'failed' })
          .eq('id', reminder.id)
      }
    }

    // 3. Expire stale waitlist offers
    const { data: expired } = await supabase
      .from('appointment_waitlist')
      .update({ status: 'expired' })
      .eq('status', 'offered')
      .lt('expires_at', now)
      .select('id')

    result.waitlistExpired = expired?.length ?? 0
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Cycle failed')
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Core logic ──

interface Reminder {
  id: string
  appointment_id: string
  channel: string
  scheduled_for: string
}

async function processOneReminder(
  supabase: ReturnType<typeof createClient>,
  reminder: Reminder,
): Promise<void> {
  // Fetch appointment with patient + doctor
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

  // Skip cancelled/completed
  if (appt.status === 'cancelled' || appt.status === 'no_show' || appt.status === 'completed') {
    await markSent(supabase, reminder.id)
    return
  }

  const patient = (appt as Record<string, unknown>).patients as Record<string, unknown> | null
  const doctor = (appt as Record<string, unknown>).doctors as Record<string, unknown> | null
  const patientProfile = patient?.profiles as Record<string, string> | null
  const doctorProfile = doctor?.profiles as Record<string, string> | null
  const phone = patientProfile?.phone

  if (!phone) throw new Error(`Patient has no phone`)

  // Build message
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
    console.log(`[DRY RUN] → ${phone}: ${message.substring(0, 80)}...`)
    await markSent(supabase, reminder.id)
    return
  }

  // Send via OpenClaw webhook
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

  await markSent(supabase, reminder.id)
}

async function markSent(supabase: ReturnType<typeof createClient>, id: string) {
  await supabase
    .from('appointment_reminders')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)
}

// ── Message templates ──

function buildReminder24h(
  patient: string, doctor: string, date: string, time: string, type: string, location: string | null,
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
