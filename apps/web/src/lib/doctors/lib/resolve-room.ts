import type { SupabaseClient } from '@supabase/supabase-js';

type AdminClient = SupabaseClient;

// A room identifier is never an authorization credential. Check the assigned
// professional before using a service-role client to read clinical material.
export function isDoctorAssignedToRoom(
  participants: ResolvedRoomParticipants | null,
  doctorId: string,
  doctorUserId?: string,
): participants is ResolvedRoomParticipants {
  // Legacy calls may store doctors.id or auth.users.id as doctor_id.
  // Both identities must come from the authenticated caller, never the URL.
  return Boolean(
    participants && doctorId &&
    (participants.doctorId === doctorId ||
      (doctorUserId && participants.doctorId === doctorUserId)),
  );
}

export function isClinicalPatientId(value: string | null | undefined): boolean {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

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
 * Resolve pharmacy dispatch provenance first for pharmacy rooms, then calls and
 * telemedicine_sessions. Legacy nonstandard room IDs use a final dispatch fallback.
 * Some call rows are created for guest/bootstrap flows before patient_id is present;
 * those must not short-circuit richer sources that can still link the room to a patient.
 */
export interface ResolvedRoomParticipants {
  patientId: string;
  doctorId: string | null;
  appointmentId: string | null;
  /** Present only for on-demand pharmacy/kiosk dispatch flows */
  triage?: {
    patientDni: string | null;
    patientName: string | null;
    symptomSummary: string | null;
    dispatchRequestId: string;
  };
}

async function resolvePharmacyDispatchRoom(
  admin: AdminClient,
  roomId: string,
): Promise<ResolvedRoomParticipants | null> {
  // 3. Pharmacy dispatch: a document number is NOT patient identity verification.
  const { data: dispatchRow, error: dispatchError } = await admin
    .from('pharmacy_dispatch_requests')
    .select('id, patient_id, patient_dni, patient_name, assigned_doctor_id, symptom_summary')
    .eq('cloudflare_room_id', roomId)
    .in('status', ['matched', 'in_call', 'transferring', 'transferred', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!dispatchError && dispatchRow) {
    const dispatch = dispatchRow as {
      id: string;
      patient_id: string | null;
      patient_dni: string | null;
      patient_name: string | null;
      assigned_doctor_id: string | null;
      symptom_summary: string | null;
    };

    // New dispatches have a visit-scoped UUID. Legacy requests without a
    // linked record remain triage-only and must never be used for documents.
    const patientId = isClinicalPatientId(dispatch.patient_id)
      ? dispatch.patient_id!
      : `dispatch:${dispatch.id}`;
    return {
      patientId,
      doctorId: dispatch.assigned_doctor_id,
      appointmentId: null,
      triage: {
        patientDni: dispatch.patient_dni,
        patientName: dispatch.patient_name,
        symptomSummary: dispatch.symptom_summary,
        dispatchRequestId: dispatch.id,
      },
    };
  }

  return null;
}

export async function resolveRoomParticipants(
  admin: AdminClient,
  roomId: string,
): Promise<ResolvedRoomParticipants | null> {
  const isPharmacyRoom = roomId.startsWith('cf-room') ||
    roomId.startsWith('room_pharm');

  // Resolve dispatch provenance BEFORE calls. A call row may have a patient
  // UUID, but that does not transform a pharmacy guest into a verified
  // patient allowed to receive official prescriptions or certificates.
  if (isPharmacyRoom) {
    const pharmacy = await resolvePharmacyDispatchRoom(admin, roomId);
    if (pharmacy) return pharmacy;
  }

  // 1. Try calls table first (has doctor_id for P2P calls)
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

  // 2. Fallback to telemedicine_sessions (has appointment_id for richer context)
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

  // Nonstandard historic room names may still have a dispatch row.
  if (!isPharmacyRoom) {
    return resolvePharmacyDispatchRoom(admin, roomId);
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
