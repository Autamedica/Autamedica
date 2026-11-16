import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { badRequest, forbidden, internalError, jsonFail, jsonOk } from '@/lib/api-helpers';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { consultationContextService } from '@/lib/doctors/services/consultation-context.service';
import { resolveRoomParticipants, isDoctorAssignedToRoom } from '@/lib/doctors/lib/resolve-room';
import { fetchAndPersistOfficialIdentity } from '@/lib/patients/services/patient-identity.service';

export const POST: APIRoute = async ({ request, params, locals }) => {
  const roomId = params.roomId;
  if (!roomId) return badRequest('missing_room_id');
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const admin = createAstroAdminClient(locals.runtime?.env);
    const doctorId = await consultationContextService.verifyDoctorAccess(admin, auth.user.id);
    if (!doctorId) return forbidden('doctor_not_found');
    const participants = await resolveRoomParticipants(admin, roomId);
    if (!isDoctorAssignedToRoom(participants, doctorId, auth.user.id)) return forbidden('room_not_assigned_to_doctor');

    let dni: string | null = null;
    let gender: string | null = null;
    let patientId: string | null = null;
    let dispatchRequestId: string | null = null;
    let userId: string | null = null;
    let declaredName: string | null = null;

    if (participants?.triage) {
      dni = participants.triage.patientDni;
      gender = participants.triage.patientGenderCode;
      patientId = participants.triage.patientId;
      dispatchRequestId = participants.triage.dispatchRequestId;
      declaredName = participants.triage.patientName;
      if (participants.triage.identityStatus === 'verified_renaper') {
        return jsonOk({
          identityStatus: 'verified_renaper',
          officialFullName: participants.triage.officialFullName,
          officialCuil: participants.triage.officialCuil,
          officialBirthDate: participants.triage.officialBirthDate,
          officialGender: participants.triage.officialGender,
        });
      }
    } else if (participants?.patientId) {
      patientId = participants.patientId;
      const { data: patient, error } = await admin.from('patients')
        .select('user_id,dni,gender,identity_status,official_full_name')
        .eq('id', patientId).maybeSingle();
      if (error) throw error;
      if (!patient) return badRequest('patient_not_found');
      if (patient.identity_status === 'verified_renaper') {
        return jsonOk({ identityStatus: 'verified_renaper', officialFullName: patient.official_full_name });
      }
      userId = patient.user_id;
      dni = patient.dni;
      gender = patient.gender;
      if (userId) {
        const { data: profile } = await admin.from('profiles')
          .select('first_name,last_name').eq('user_id', userId).maybeSingle();
        declaredName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
      }
    }

    if (patientId && !userId) {
      const { data: patientOwner, error: patientOwnerError } = await admin
        .from('patients').select('user_id').eq('id', patientId).maybeSingle();
      if (patientOwnerError) throw patientOwnerError;
      userId = patientOwner?.user_id ?? null;
    }

    const normalizedGender = String(gender ?? '').toUpperCase();
    const sexId = ['F', 'FEMALE', 'FEMENINO'].includes(normalizedGender) ? 1
      : ['M', 'MALE', 'MASCULINO'].includes(normalizedGender) ? 2
        : ['X', 'OTHER', 'NO BINARIO'].includes(normalizedGender) ? 3 : null;
    const normalizedDni = String(dni ?? '').replace(/\D/g, '');
    if (!normalizedDni || !sexId) return badRequest('patient_dni_and_document_sex_required');
    const persisted = await fetchAndPersistOfficialIdentity({
      supabase: admin,
      dni: normalizedDni,
      sexId: sexId as 1 | 2 | 3,
      patientId,
      dispatchRequestId,
      userId,
      declaredName,
      syncProfileName: true,
      runtimeEnv: locals.runtime?.env,
      timeoutMs: 3500,
    });
    return persisted
      ? jsonOk(persisted)
      : jsonOk({ identityStatus: 'unverified', reason: 'renaper_timeout' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'RENAPER_LOOKUP_LIMIT_REACHED') {
      return jsonFail('RATE_LIMITED', 'Se alcanzó el límite de tres consultas RENAPER para este paciente.', 429);
    }
    logger.warn('[doctor-identity-renaper] live lookup unavailable', {
      code: error instanceof Error && 'code' in error ? String(error.code) : 'RENAPER_LOOKUP_UNAVAILABLE',
    });
    return internalError('renaper_identity_lookup_failed');
  }
};
