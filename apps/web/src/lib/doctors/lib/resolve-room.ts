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
 * Resolve room participants from calls first, then appointments/telemedicine_sessions.
 * Some call rows are created for guest/bootstrap flows before patient_id is present;
 * those must not short-circuit richer sources that can still link the room to a patient.
 */
export async function resolveRoomParticipants(
  admin: AdminClient,
  roomId: string,
): Promise<{ patientId: string; doctorId: string | null; appointmentId: string | null } | null> {
  // Try calls table first (has doctor_id for P2P calls)
  const { data: callRow, error: callError } = await admin
    .from('calls')
    .select('patient_id, doctor_id, appointment_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!callError && callRow) {
    const call = callRow as { patient_id: string | null; doctor_id: string | null; appointment_id?: string | null };
    if (call.patient_id) {
      return { patientId: call.patient_id, doctorId: call.doctor_id, appointmentId: call.appointment_id ?? null };
    }

    if (call.appointment_id) {
      const { data: appointmentRow, error: appointmentError } = await admin
        .from('appointments')
        .select('patient_id, doctor_id')
        .eq('id', call.appointment_id)
        .maybeSingle();

      if (appointmentError) throw appointmentError;
      const appointment = appointmentRow as { patient_id: string | null; doctor_id: string | null } | null;
      if (appointment?.patient_id) {
        return {
          patientId: appointment.patient_id,
          doctorId: call.doctor_id ?? appointment.doctor_id,
          appointmentId: call.appointment_id,
        };
      }
    }
  }

  // Fallback to telemedicine_sessions (has appointment_id for richer context)
  const { data: sessionRow } = await admin
    .from('telemedicine_sessions')
    .select('patient_id, doctor_id, appointment_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionRow) {
    const session = sessionRow as { patient_id: string; doctor_id: string; appointment_id: string | null };
    return { patientId: session.patient_id, doctorId: session.doctor_id, appointmentId: session.appointment_id };
  }

  return null;
}

/**
 * Resolve patient profile (name, date of birth, gender) from patient record ID.
 */
export async function resolvePatientProfile(
  admin: AdminClient,
  patientId: string | null,
): Promise<{ name: string; dateOfBirth: string | null; gender: string | null }> {
  if (!patientId) {
    return { name: 'Paciente', dateOfBirth: null, gender: null };
  }

  const { data: patientRow, error } = await admin
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle();

  if (error) throw error;


  const userId = (patientRow as { user_id: string | null } | null)?.user_id;
  if (!userId) {
    return { name: 'Paciente', dateOfBirth: null, gender: null };
  }

  const { data: profileRow } = await admin
    .from('profiles')
    .select('first_name, last_name, date_of_birth, gender')
    .eq('user_id', userId)
    .maybeSingle();

  const profile = profileRow as { first_name: string | null; last_name: string | null; date_of_birth: string | null; gender: string | null } | null;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();

  return {
    name: fullName || 'Paciente',
    dateOfBirth: profile?.date_of_birth ?? null,
    gender: profile?.gender ?? null,
  };
}

/**
 * Check if a doctor has access to a patient (via care team or past appointment).
 */
export async function doctorHasPatientAccess(
  admin: AdminClient,
  doctorId: string,
  patientId: string,
): Promise<boolean> {
  const [{ data: careTeam, error: careTeamError }, { data: appointment, error: appointmentError }] =
    await Promise.all([
      admin
        .from('patient_care_team')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patientId)
        .eq('active', true)
        .limit(1)
        .maybeSingle(),
      admin
        .from('appointments')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patientId)
        .limit(1)
        .maybeSingle(),
    ]);

  if (careTeamError) throw careTeamError;
  if (appointmentError) throw appointmentError;

  return Boolean((careTeam as { id: string } | null)?.id || (appointment as { id: string } | null)?.id);
}
