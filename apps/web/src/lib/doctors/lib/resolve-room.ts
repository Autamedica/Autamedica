import type { SupabaseClient } from '@supabase/supabase-js';

type AdminClient = SupabaseClient;

export async function resolveDoctorId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('doctors')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Resolve room participants from telemedicine_sessions (preferred, has appointment_id)
 * with fallback to calls table.
 */
export async function resolveRoomParticipants(
  admin: AdminClient,
  roomId: string,
): Promise<{ patientId: string; appointmentId: string | null } | null> {
  // Prefer telemedicine_sessions (has appointment_id for richer context)
  const { data: sessionRow } = await admin
    .from('telemedicine_sessions')
    .select('patient_id, appointment_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionRow) {
    const session = sessionRow as { patient_id: string; appointment_id: string | null };
    return { patientId: session.patient_id, appointmentId: session.appointment_id };
  }

  // Fallback to calls table (no appointment_id)
  const { data: callRow } = await admin
    .from('calls')
    .select('patient_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (callRow) {
    return { patientId: (callRow as { patient_id: string }).patient_id, appointmentId: null };
  }

  return null;
}
