import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import {
  updateReportContent,
  generateAndSaveReport,
} from '@/lib/doctors/services/consultation-report.backend';
import { resolveDoctorId, resolveRoomParticipants, isDoctorAssignedToRoom, isClinicalPatientId } from '@/lib/doctors/lib/resolve-room';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, badRequest, forbidden, notFound, internalError, conflict } from '@/lib/api-helpers';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';


export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAstroAdminClient(locals.runtime?.env);
    const doctorId = await resolveDoctorId(admin, user.id);
    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    const body = (await request.json()) as {
      recordId: string;
      report: Record<string, unknown>;
      doctorNotes?: string;
    };

    if (!body.recordId) {
      return badRequest('missing_record_id');
    }

    const participants = await resolveRoomParticipants(admin, roomId);
    if (!isDoctorAssignedToRoom(participants, doctorId, user.id)) return forbidden('room_not_assigned_to_doctor');

    await updateReportContent(
      body.recordId,
      doctorId,
      body.report,
      body.doctorNotes,
      locals.runtime?.env ?? null,
    );
    return jsonOk(null);
  } catch (error) {
    logger.error('[consultation-report] PATCH error', error);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request, params, locals }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAstroAdminClient(locals.runtime?.env);
    const doctorId = await resolveDoctorId(admin, user.id);
    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    const participants = await resolveRoomParticipants(admin, roomId);
    if (!participants) {
      return notFound('room_not_found');
    }

    if (!isDoctorAssignedToRoom(participants, doctorId, user.id)) {
      return forbidden('room_not_assigned_to_doctor');
    }
    const { patientId, appointmentId } = participants;
    if (!isClinicalPatientId(patientId)) {
      return conflict('report_requires_linked_patient');
    }

    const body = (await request.json()) as { doctorNotes?: string };

    const result = await generateAndSaveReport(
      roomId,
      patientId,
      doctorId,
      appointmentId,
      body.doctorNotes ?? null,
      locals.runtime?.env ?? null,
    );
    return jsonOk(result);
  } catch (error) {
    logger.error('[consultation-report] POST error', {
      roomId,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    });
    return internalError();
  }
};
