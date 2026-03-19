/**
 * Reminder Engine — Programa y gestiona recordatorios de citas.
 *
 * Crea recordatorios automáticos (24h y 2h antes) al agendar una cita.
 * Diseñado para que un worker/cron procese los pendientes y los envíe
 * por el canal correspondiente (WhatsApp vía OpenClaw, email, push, etc).
 */

import type {
  AppointmentReminder,
  AppointmentReminderInsert,
  ReminderChannel,
  ReminderResponse,
  SchedulingConfig,
} from '@autamedica/types';
import { DEFAULT_SCHEDULING_CONFIG } from '@autamedica/types';
import type { SupabaseLike } from './supabase';

/**
 * Programa recordatorios para una cita.
 * Por defecto crea recordatorios a 24h y 2h antes.
 */
export async function scheduleReminders(
  supabase: SupabaseLike,
  appointmentId: string,
  channel: ReminderChannel = 'whatsapp',
  config?: Partial<SchedulingConfig>,
): Promise<AppointmentReminder[]> {
  // Get appointment start_time
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select('start_time, status')
    .eq('id', appointmentId)
    .single();

  if (apptErr || !appt) throw new Error('Appointment not found');
  if (appt.status === 'cancelled' || appt.status === 'no_show') {
    throw new Error('Cannot schedule reminders for cancelled/no-show appointments');
  }

  const hoursBefore = config?.reminder_hours_before ?? DEFAULT_SCHEDULING_CONFIG.reminder_hours_before;
  const startTime = new Date(appt.start_time);
  const now = new Date();

  const inserts: AppointmentReminderInsert[] = [];

  for (const hours of hoursBefore) {
    const reminderTime = new Date(startTime.getTime() - hours * 60 * 60 * 1000);
    // Only schedule if the reminder is in the future
    if (reminderTime > now) {
      inserts.push({
        appointment_id: appointmentId as import('@autamedica/types').UUID,
        channel,
        scheduled_for: reminderTime.toISOString() as import('@autamedica/types').ISODateString,
      });
    }
  }

  if (inserts.length === 0) return [];

  const { data, error } = await supabase
    .from('appointment_reminders')
    .insert(inserts)
    .select('*');

  if (error) throw new Error(`Error scheduling reminders: ${error.message}`);
  return (data ?? []) as AppointmentReminder[];
}

/**
 * Obtiene recordatorios pendientes que deben enviarse ahora.
 * Diseñado para ser llamado por un cron/worker cada minuto.
 */
export async function getPendingReminders(
  supabase: SupabaseLike,
  limit: number = 50,
): Promise<AppointmentReminder[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('appointment_reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Error fetching pending reminders: ${error.message}`);
  return (data ?? []) as AppointmentReminder[];
}

/**
 * Marca un recordatorio como enviado y opcionalmente registra la respuesta.
 */
export async function markReminderSent(
  supabase: SupabaseLike,
  reminderId: string,
  response?: ReminderResponse | null,
): Promise<void> {
  const { error } = await supabase
    .from('appointment_reminders')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      ...(response ? { response } : {}),
    })
    .eq('id', reminderId);

  if (error) throw new Error(`Error marking reminder sent: ${error.message}`);
}

/**
 * Marca un recordatorio como fallido.
 */
export async function markReminderFailed(
  supabase: SupabaseLike,
  reminderId: string,
): Promise<void> {
  const { error } = await supabase
    .from('appointment_reminders')
    .update({ status: 'failed' })
    .eq('id', reminderId);

  if (error) throw new Error(`Error marking reminder failed: ${error.message}`);
}

/**
 * Cancela todos los recordatorios pendientes de una cita.
 * Llamar cuando se cancela una cita.
 */
export async function cancelReminders(
  supabase: SupabaseLike,
  appointmentId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('appointment_reminders')
    .update({ status: 'cancelled' })
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')
    .select('id');

  if (error) throw new Error(`Error cancelling reminders: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * Procesa la respuesta de un paciente a un recordatorio.
 * Si el paciente confirma, actualiza el appointment status.
 * Si cancela, cancela la cita y activa el waitlist.
 */
export async function processReminderResponse(
  supabase: SupabaseLike,
  reminderId: string,
  response: ReminderResponse,
): Promise<void> {
  // Get reminder and appointment
  const { data: reminder, error: remErr } = await supabase
    .from('appointment_reminders')
    .select('*, appointments(id, status)')
    .eq('id', reminderId)
    .single();

  if (remErr || !reminder) throw new Error('Reminder not found');

  // Update reminder
  await supabase
    .from('appointment_reminders')
    .update({ response, status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', reminderId);

  // Update appointment based on response
  if (response === 'confirmed') {
    await supabase
      .from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', reminder.appointment_id)
      .eq('status', 'scheduled');
  } else if (response === 'cancelled') {
    await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', reminder.appointment_id)
      .not('status', 'in', '("completed","cancelled")');

    // Cancel remaining reminders
    await cancelReminders(supabase, reminder.appointment_id);
  }
}
