import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { getConsultationContext } from '@/lib/doctors/services/consultation-context.backend';
import { resolveDoctorId, resolveRoomParticipants, resolvePatientProfile } from '@/lib/doctors/lib/resolve-room';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';
import { withAuth, isAuthed } from '@/lib/api-auth';

export const GET: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    const auth = await withAuth(request);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAstroAdminClient();

    const doctorId = await resolveDoctorId(admin, user.id);
    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    const participants = await resolveRoomParticipants(admin, roomId);
    if (!participants) {
      return jsonOk({
        hasAnamnesis: false,
        patient: null,
        summary: null,
        extraction: null,
        redFlags: [],
        suggestedQuestions: [],
      });
    }

    const { patientId } = participants;
    const patientProfile = await resolvePatientProfile(admin, patientId);
    const context = await getConsultationContext(roomId, patientId, patientProfile);

    return jsonOk(context);
  } catch (error) {
    logger.error('[consultation-context] GET error', error);
    return internalError();
  }
};
