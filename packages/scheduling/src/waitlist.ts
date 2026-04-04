/**
 * Waitlist Manager — Gestión de lista de espera para turnos.
 *
 * Cuando se libera un slot (cancelación), ofrece automáticamente
 * al primer paciente en cola que coincida con las preferencias.
 */

import type {
  WaitlistEntry,
  WaitlistEntryInsert,
  SchedulingConfig,
} from '@autamedica/types';
import type { SupabaseLike } from './supabase';

/** Converts "HH:mm" to minutes since midnight for reliable numeric comparison. */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Agrega un paciente a la lista de espera de un doctor.
 */
export async function addToWaitlist(
  supabase: SupabaseLike,
  entry: WaitlistEntryInsert,
): Promise<WaitlistEntry> {
  const { data, error } = await supabase
    .from('appointment_waitlist')
    .insert({
      ...entry,
      status: 'waiting',
    })
    .select('*')
    .single();

  if (error) throw new Error(`Error adding to waitlist: ${error.message}`);
  return data as WaitlistEntry;
}

/**
 * Cuando se libera un slot, busca al primer paciente en cola que encaje
 * y le ofrece el turno. La oferta expira según config.
 */
export async function processWaitlist(
  supabase: SupabaseLike,
  doctorId: string,
  freedSlot: { date: string; start_time: string; end_time: string },
  config?: Partial<SchedulingConfig>,
): Promise<WaitlistEntry | null> {
  const expiryHours = config?.waitlist_offer_expiry_hours ?? 4;

  // Find first waiting entry that matches the freed slot
  const slotDate = freedSlot.date;
  const slotTimeStart = freedSlot.start_time.split('T')[1]?.substring(0, 5) ?? '00:00';

  const { data: candidates, error } = await supabase
    .from('appointment_waitlist')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('status', 'waiting')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Error processing waitlist: ${error.message}`);
  if (!candidates || candidates.length === 0) return null;

  // Filter candidates that match preferences (numeric comparison for times)
  const slotStartMins = timeToMinutes(slotTimeStart);
  const match = (candidates as WaitlistEntry[]).find((c) => {
    if (c.preferred_date_start && slotDate < c.preferred_date_start) return false;
    if (c.preferred_date_end && slotDate > c.preferred_date_end) return false;
    if (c.preferred_time_start && slotStartMins < timeToMinutes(c.preferred_time_start)) return false;
    if (c.preferred_time_end && slotStartMins >= timeToMinutes(c.preferred_time_end)) return false;
    return true;
  });

  if (!match) return null;

  // Offer the slot
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiryHours);

  const { data: updated, error: updateErr } = await supabase
    .from('appointment_waitlist')
    .update({
      status: 'offered',
      offered_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', match.id)
    .eq('status', 'waiting') // Optimistic concurrency
    .select('*')
    .single();

  if (updateErr) throw new Error(`Error offering slot: ${updateErr.message}`);
  return updated as WaitlistEntry;
}

/**
 * Marca una oferta de waitlist como aceptada y crea la cita.
 */
export async function acceptWaitlistOffer(
  supabase: SupabaseLike,
  waitlistId: string,
  appointmentData: {
    start_time: string;
    end_time: string;
    type?: string;
  },
): Promise<{ waitlist: WaitlistEntry; appointment_id: string }> {
  // Get the waitlist entry
  const { data: entry, error: getErr } = await supabase
    .from('appointment_waitlist')
    .select('*')
    .eq('id', waitlistId)
    .eq('status', 'offered')
    .single();

  if (getErr || !entry) throw new Error('Waitlist offer not found or expired');

  const wl = entry as WaitlistEntry;

  // Check expiry
  if (wl.expires_at && new Date(wl.expires_at) < new Date()) {
    await supabase
      .from('appointment_waitlist')
      .update({ status: 'expired' })
      .eq('id', waitlistId);
    throw new Error('Waitlist offer has expired');
  }

  // Create the appointment
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .insert({
      patient_id: wl.patient_id,
      doctor_id: wl.doctor_id,
      start_time: appointmentData.start_time,
      end_time: appointmentData.end_time,
      type: appointmentData.type ?? wl.appointment_type,
      status: 'scheduled',
    })
    .select('id')
    .single();

  if (apptErr) throw new Error(`Error creating appointment from waitlist: ${apptErr.message}`);

  // Mark waitlist as booked
  const { data: updated, error: updateErr } = await supabase
    .from('appointment_waitlist')
    .update({ status: 'booked' })
    .eq('id', waitlistId)
    .select('*')
    .single();

  if (updateErr) throw new Error(`Error updating waitlist: ${updateErr.message}`);

  return {
    waitlist: updated as WaitlistEntry,
    appointment_id: (appt as { id: string }).id,
  };
}

/**
 * Expira ofertas de waitlist que no fueron respondidas a tiempo.
 * Diseñado para ejecutarse como cron/worker periódico.
 */
export async function expireStaleOffers(
  supabase: SupabaseLike,
): Promise<number> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('appointment_waitlist')
    .update({ status: 'expired' })
    .eq('status', 'offered')
    .lt('expires_at', now)
    .select('id');

  if (error) throw new Error(`Error expiring stale offers: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * Cancela una entrada de waitlist.
 */
export async function cancelWaitlistEntry(
  supabase: SupabaseLike,
  waitlistId: string,
  patientId: string,
): Promise<void> {
  const { error } = await supabase
    .from('appointment_waitlist')
    .update({ status: 'cancelled' })
    .eq('id', waitlistId)
    .eq('patient_id', patientId)
    .in('status', ['waiting', 'offered']);

  if (error) throw new Error(`Error cancelling waitlist: ${error.message}`);
}

/**
 * Obtiene las entradas de waitlist de un doctor (para su panel).
 */
export async function getDoctorWaitlist(
  supabase: SupabaseLike,
  doctorId: string,
): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from('appointment_waitlist')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('status', 'waiting')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Error fetching waitlist: ${error.message}`);
  return (data ?? []) as WaitlistEntry[];
}
