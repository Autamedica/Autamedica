/**
 * Reminder Worker — Procesa recordatorios pendientes y los envía vía OpenClaw.
 *
 * Diseñado para ejecutarse como cron job (cada minuto) o como script
 * de larga duración con intervalos.
 *
 * Flujo:
 * 1. Consulta appointment_reminders con status='pending' y scheduled_for <= now
 * 2. Para cada reminder, obtiene datos de la cita + paciente + doctor
 * 3. Envía mensaje vía OpenClaw (WhatsApp/Telegram)
 * 4. Marca el reminder como sent/failed
 * 5. Expira ofertas de waitlist vencidas
 */

import type { SupabaseLike } from './supabase';
import type { AppointmentReminder } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import { getPendingReminders, markReminderForRetry, markReminderSent } from './reminders';
import { expireStaleOffers } from './waitlist';
import { markOverdueAppointmentsNoShow } from './no-show-reaper';
import {
  sendMessageWithFallback,
  buildReminder24h,
  buildReminder2h,
  type OpenClawConfig,
  type ReminderMessageData,
} from './openclaw';
import { processUnsentWaitlistOffers } from './waitlist-dispatch';

interface WorkerConfig {
  openclaw: OpenClawConfig;
  /** Máximo de recordatorios a procesar por ciclo */
  batchSize?: number;
  /** Si true, solo loguea sin enviar (dry run) */
  dryRun?: boolean;
}

interface WorkerResult {
  processed: number;
  sent: number;
  failed: number;
  waitlistOffersSent: number;
  waitlistExpired: number;
  noShowsMarked: number;
  errors: string[];
}

/**
 * Ejecuta un ciclo del worker de recordatorios.
 * Llamar desde un cron o setInterval.
 */
export async function processReminderCycle(
  supabase: SupabaseLike,
  config: WorkerConfig,
): Promise<WorkerResult> {
  const result: WorkerResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    waitlistOffersSent: 0,
    waitlistExpired: 0,
    noShowsMarked: 0,
    errors: [],
  };

  try {
    // 1. Get pending reminders
    const reminders = await getPendingReminders(supabase, config.batchSize ?? 50);
    result.processed = reminders.length;

    // 2. Process each reminder
    for (const reminder of reminders) {
      try {
        await processOneReminder(supabase, reminder, config);
        result.sent++;
      } catch (err) {
        result.failed++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`Reminder ${reminder.id}: ${msg}`);
        await markReminderForRetry(supabase, reminder, msg);
      }
    }

    // 3. Dispatch unsent waitlist offers
    const waitlistDispatch = await processUnsentWaitlistOffers(supabase, config);
    result.waitlistOffersSent = waitlistDispatch.sent;
    result.errors.push(...waitlistDispatch.errors.map((err) => `Waitlist: ${err}`));

    // 4. Expire stale waitlist offers
    result.waitlistExpired = await expireStaleOffers(supabase);

    // 5. Mark overdue appointments as no_show
    result.noShowsMarked = await markOverdueAppointmentsNoShow(supabase);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Worker cycle failed');
  }

  return result;
}

async function processOneReminder(
  supabase: SupabaseLike,
  reminder: AppointmentReminder,
  config: WorkerConfig,
): Promise<void> {
  // Fetch appointment + patient + doctor data
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select(`
      id, start_time, end_time, type, status, location, meeting_url,
      patients!inner(id, user_id, profiles!inner(first_name, last_name, phone)),
      doctors!inner(id, user_id, profiles!inner(first_name, last_name))
    `)
    .eq('id', reminder.appointment_id)
    .single();

  if (apptErr || !appt) {
    throw new Error(`Appointment ${reminder.appointment_id} not found`);
  }

  // Skip if appointment is already cancelled
  if (appt.status === 'cancelled' || appt.status === 'no_show') {
    await markReminderSent(supabase, reminder.id);
    return;
  }

  const patient = appt.patients;
  const doctor = appt.doctors;
  const patientProfile = patient?.profiles;
  const doctorProfile = doctor?.profiles;

  if (!patientProfile?.phone) {
    throw new Error(`Patient ${patient?.id} has no phone number`);
  }

  // Determine which reminder template to use
  const startTime = new Date(appt.start_time);
  const now = new Date();
  const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  const messageData: ReminderMessageData = {
    patientName: patientProfile.first_name ?? 'Paciente',
    doctorName: [doctorProfile?.first_name, doctorProfile?.last_name].filter(Boolean).join(' ') ?? 'Doctor',
    date: startTime.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    time: startTime.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    type: appt.type ?? 'Consulta',
    location: appt.location ?? undefined,
  };

  const message = hoursUntil > 6
    ? buildReminder24h(messageData)
    : buildReminder2h(messageData);

  if (config.dryRun) {
    logger.info(`[DRY RUN] Would send to ${patientProfile.phone}:\n${message}`);
    await markReminderSent(supabase, reminder.id);
    return;
  }

  // Send via OpenClaw (webhook HTTP first, CLI fallback)
  const sendResult = await sendMessageWithFallback(config.openclaw, {
    to: patientProfile.phone,
    message,
    channel: reminder.channel === 'whatsapp' ? 'whatsapp' : undefined,
  });

  if (!sendResult.ok) {
    throw new Error(sendResult.error ?? 'OpenClaw send failed');
  }

  await markReminderSent(supabase, reminder.id);
}
