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
    patientId: string | null;
    patientDni: string | null;
    patientCpf: string | null;
    patientName: string | null;
    careCountry: string | null;
    symptomSummary: string | null;
    dispatchRequestId: string;
    identityStatus: 'verified_renaper' | 'unverified' | 'mismatch' | null;
    officialFullName: string | null; officialCuil: string | null; officialBirthDate: string | null;
    officialGender: string | null; pucoCoverageName: string | null; pucoCoverageCode: string | null;
    patientGenderCode: 'F' | 'M' | 'X' | null;
  };
}

async function resolvePharmacyDispatchRoom(
  admin: AdminClient,
  roomId: string,
): Promise<ResolvedRoomParticipants | null> {
  // 3. Pharmacy dispatch: a document number is NOT patient identity verification.
  const { data: dispatchRow, error: dispatchError } = await admin
    .from('pharmacy_dispatch_requests')
    .select('id, patient_id, patient_dni, patient_cpf, patient_name, care_country, assigned_doctor_id, symptom_summary, patient_gender_code, identity_status, official_full_name, official_cuil, official_birth_date, official_gender, puco_coverage_name, puco_coverage_code')
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
      patient_cpf: string | null;
      patient_name: string | null;
      care_country: string | null;
      assigned_doctor_id: string | null;
      symptom_summary: string | null;
      patient_gender_code: 'F' | 'M' | 'X' | null;
      identity_status: 'verified_renaper' | 'unverified' | 'mismatch' | null;
      official_full_name: string | null; official_cuil: string | null; official_birth_date: string | null;
      official_gender: string | null; puco_coverage_name: string | null; puco_coverage_code: string | null;
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
        patientId: dispatch.patient_id,
        patientDni: dispatch.patient_dni,
        patientCpf: dispatch.patient_cpf,
        patientName: dispatch.patient_name,
        careCountry: dispatch.care_country,
        symptomSummary: dispatch.symptom_summary,
        dispatchRequestId: dispatch.id,
        identityStatus: dispatch.identity_status, officialFullName: dispatch.official_full_name,
        officialCuil: dispatch.official_cuil, officialBirthDate: dispatch.official_birth_date,
        officialGender: dispatch.official_gender, pucoCoverageName: dispatch.puco_coverage_name,
        pucoCoverageCode: dispatch.puco_coverage_code, patientGenderCode: dispatch.patient_gender_code,
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
  admin: AdminClient, patientId: string | null,
): Promise<{
  name: string; dateOfBirth: string | null; gender: string | null;
  identityStatus: 'verified_renaper' | 'unverified' | 'mismatch';
  officialFullName: string | null; dni: string | null; cuil: string | null; pucoCoverage: string | null;
}> {
  const empty = { name: 'Paciente', dateOfBirth: null, gender: null, identityStatus: 'unverified' as const,
    officialFullName: null, dni: null, cuil: null, pucoCoverage: null };
  if (!patientId || !isClinicalPatientId(patientId)) return empty;
  const { data: row, error } = await admin.from('patients').select(
    'user_id,birth_date,gender,dni,cuil,identity_status,official_full_name,official_cuil,official_birth_date,official_gender,puco_coverage_name'
  ).eq('id', patientId).maybeSingle();
  if (error) throw error;
  if (!row) return empty;
  const p = row as { user_id:string|null; birth_date:string|null; gender:string|null; dni:string|null; cuil:string|null; identity_status?:string|null; official_full_name?:string|null; official_cuil?:string|null; official_birth_date?:string|null; official_gender?:string|null; puco_coverage_name?:string|null };
  const { data: profileRow } = p.user_id ? await admin.from('profiles').select('first_name,last_name,date_of_birth,gender').eq('user_id',p.user_id).maybeSingle() : {data:null};
  const profile = profileRow as {first_name:string|null;last_name:string|null;date_of_birth:string|null;gender:string|null}|null;
  const verified = p.identity_status === 'verified_renaper';
  return {
    name: verified && p.official_full_name ? p.official_full_name : [profile?.first_name,profile?.last_name].filter(Boolean).join(' ').trim() || 'Paciente',
    dateOfBirth: verified ? p.official_birth_date ?? p.birth_date : p.birth_date ?? profile?.date_of_birth ?? null,
    gender: verified ? p.official_gender ?? p.gender : p.gender ?? profile?.gender ?? null,
    identityStatus: verified ? 'verified_renaper' : p.identity_status === 'mismatch' ? 'mismatch' : 'unverified',
    officialFullName: verified ? p.official_full_name ?? null : null, dni: p.dni,
    cuil: verified ? p.official_cuil ?? p.cuil : p.cuil, pucoCoverage: verified ? p.puco_coverage_name ?? null : null,
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
