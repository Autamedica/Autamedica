/**
 * Reminder Engine — Programa y gestiona recordatorios de citas.
 *
 * La creación inicial ahora vive en la base vía RPC/trigger para que
 * appointment + reminders se creen atómicamente en la misma transacción.
 */

import type {
  AppointmentReminder,
  ReminderChannel,
  ReminderResponse,
} from '@autamedica/types';
import type { SupabaseLike } from './supabase';

const MAX_REMINDER_RETRIES = 3;
const BASE_RETRY_MINUTES = 5;
const MAX_RETRY_MINUTES = 60;

function computeRetryAt(attempt: number): string {
  const minutes = Math.min(BASE_RETRY_MINUTES * 2 ** Math.max(attempt - 1, 0), MAX_RETRY_MINUTES);
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

/**
 * Programa recordatorios para una cita reusando la función SQL central.
 * Se usa principalmente en reschedules o reparaciones explícitas.
 */
export async function scheduleReminders(
  supabase: SupabaseLike,
  appointmentId: string,
  channel: ReminderChannel = 'whatsapp',
): Promise<AppointmentReminder[]> {
  const { error: rpcError } = await supabase.rpc('schedule_appointment_reminders', {
    target_appointment_id: appointmentId,
    reminder_channel: channel,
  });

  if (rpcError) throw new Error(`Error scheduling reminders: ${rpcError.message}`);

  const { data, error } = await supabase
    .from('appointment_reminders')
    .select('*')
    .eq('appointment_id', appointmentId)
    .eq('channel', channel)
    .neq('status', 'cancelled')
    .order('scheduled_for', { ascending: true });

  if (error) throw new Error(`Error fetching scheduled reminders: ${error.message}`);
  return (data ?? []) as AppointmentReminder[];
}

/**
 * Obtiene recordatorios pendientes que deben enviarse ahora.
 * Incluye retries cuyo next_retry_at ya venció.
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
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
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
      next_retry_at: null,
      last_error: null,
      ...(response ? { response } : {}),
    })
    .eq('id', reminderId);

  if (error) throw new Error(`Error marking reminder sent: ${error.message}`);
}

/**
 * Marca un recordatorio como fallido terminal.
 */
export async function markReminderFailed(
  supabase: SupabaseLike,
  reminderId: string,
  errorMessage?: string,
): Promise<void> {
  const { error } = await supabase
    .from('appointment_reminders')
    .update({
      status: 'failed',
      next_retry_at: null,
      ...(errorMessage ? { last_error: errorMessage } : {}),
    })
    .eq('id', reminderId);

  if (error) throw new Error(`Error marking reminder failed: ${error.message}`);
}

/**
 * Programa un reintento con backoff exponencial. Solo pasa a estado failed
 * cuando se agota el máximo de intentos.
 */
export async function markReminderForRetry(
  supabase: SupabaseLike,
  reminder: Pick<AppointmentReminder, 'id' | 'retry_count'>,
  errorMessage: string,
  maxRetries: number = MAX_REMINDER_RETRIES,
): Promise<'retrying' | 'failed'> {
  const nextAttempt = (reminder.retry_count ?? 0) + 1;
  const exhausted = nextAttempt >= maxRetries;

  const { error } = await supabase
    .from('appointment_reminders')
    .update({
      status: exhausted ? 'failed' : 'pending',
      retry_count: nextAttempt,
      next_retry_at: exhausted ? null : computeRetryAt(nextAttempt),
      last_error: errorMessage,
    })
    .eq('id', reminder.id);

  if (error) throw new Error(`Error scheduling reminder retry: ${error.message}`);
  return exhausted ? 'failed' : 'retrying';
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
    .update({ status: 'cancelled', next_retry_at: null })
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
  const { data: reminder, error: remErr } = await supabase
    .from('appointment_reminders')
    .select('*, appointments(id, status)')
    .eq('id', reminderId)
    .single();

  if (remErr || !reminder) throw new Error('Reminder not found');

  await supabase
    .from('appointment_reminders')
    .update({
      response,
      status: 'sent',
      sent_at: new Date().toISOString(),
      next_retry_at: null,
      last_error: null,
    })
    .eq('id', reminderId);

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

    await cancelReminders(supabase, reminder.appointment_id);
  }
}

/**
 * Envía un recordatorio vía webhook a OpenClaw.
 * Llama al endpoint de hooks del gateway para que el agente procese el mensaje.
 */
export async function sendReminderViaWebhook(
  supabase: SupabaseLike,
  reminderId: string,
  config: {
    gatewayUrl: string;
    token: string;
    agentId: string;
  },
): Promise<void> {
  const { data: reminder, error } = await supabase
    .from('appointment_reminders')
    .select(`
      *,
      appointments:appointment_id (
        id,
        start_time,
        type,
        location,
        status,
        patient:patient_id (first_name, last_name, phone),
        doctor:doctor_id (first_name, last_name)
      )
    `)
    .eq('id', reminderId)
    .single();

  if (error || !reminder) {
    throw new Error(`Reminder not found: ${error?.message}`);
  }

  interface AppointmentJoin {
    id: string
    start_time: string
    type: string
    location: string | null
    status: string
    patient: { first_name: string; last_name: string; phone: string | null } | null
    doctor: { first_name: string; last_name: string } | null
  }

  const appt = reminder.appointments as AppointmentJoin | null;
  if (!appt) throw new Error('Appointment data missing');

  const patient = appt.patient;
  const doctor = appt.doctor;

  if (!patient?.phone) {
    throw new Error('Patient phone missing');
  }

  if (!doctor) {
    throw new Error('Doctor data missing');
  }

  const dateObj = new Date(appt.start_time);
  const dateStr = dateObj.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeStr = dateObj.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const lines = [
    `Recordatorio de turno`,
    `Paciente: ${patient.first_name} ${patient.last_name}`.trim(),
    `Doctor: ${doctor.first_name} ${doctor.last_name}`.trim(),
    `Fecha: ${dateStr}`,
    `Hora: ${timeStr}`,
    `Tipo: ${appt.type}`,
    appt.location ? `Ubicación: ${appt.location}` : null,
  ].filter(Boolean);

  const response = await fetch(config.gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      agentId: config.agentId,
      to: patient.phone,
      channel: reminder.channel,
      message: lines.join('\n'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook send failed with status ${response.status}`);
  }

  await markReminderSent(supabase, reminderId);
}
