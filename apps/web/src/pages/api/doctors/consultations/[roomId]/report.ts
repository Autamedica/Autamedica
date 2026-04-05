import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import {
  updateReportContent,
  generateAndSaveReport,
} from '@/lib/doctors/services/consultation-report.backend';
import { resolveDoctorId, resolveRoomParticipants } from '@/lib/doctors/lib/resolve-room';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, badRequest, forbidden, notFound, internalError } from '@/lib/api-helpers';
import { withAuthRole, isAuthed } from '@/lib/api-auth';

const DOCTOR_ROLES = ['doctor', 'organization_admin', 'platform_admin', 'admin'] as const

export const PATCH: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAstroAdminClient();
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

    await updateReportContent(body.recordId, doctorId, body.report, body.doctorNotes);
    return jsonOk(null);
  } catch (error) {
    logger.error('[consultation-report] PATCH error', error);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAstroAdminClient();
    const doctorId = await resolveDoctorId(admin, user.id);
    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    const participants = await resolveRoomParticipants(admin, roomId);
    if (!participants) {
      return notFound('room_not_found');
    }

    const { patientId, appointmentId } = participants;
    const body = (await request.json()) as { doctorNotes?: string };

    const result = await generateAndSaveReport(roomId, patientId, doctorId, appointmentId, body.doctorNotes ?? null);
    return jsonOk(result);
  } catch (error) {
    logger.error('[consultation-report] POST error', error);
    return internalError();
  }
};
