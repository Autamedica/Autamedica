import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';

import { consultationContextService } from '@/lib/doctors/services/consultation-context.service';
import { resolveRoomParticipants, isDoctorAssignedToRoom } from '@/lib/doctors/lib/resolve-room';

export const GET: APIRoute = async ({ request, params, locals }) => {
  const roomId = params.roomId;
  if (!roomId) return badRequest('missing_room_id');

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;

    const admin = createAstroAdminClient(locals.runtime?.env);

    const doctorId = await consultationContextService.verifyDoctorAccess(admin, auth.user.id);
    if (!doctorId) return forbidden('doctor_not_found');

    // The admin client bypasses RLS. A doctor role alone must never grant
    // access to another physician's room and its confidential anamnesis.
    const participants = await resolveRoomParticipants(admin, roomId);
    if (!isDoctorAssignedToRoom(participants, doctorId, auth.user.id)) {
      return forbidden('room_not_assigned_to_doctor');
    }

    const result = await consultationContextService.getContext(admin, roomId, participants);
    return jsonOk(result);
  } catch (error) {
    logger.error('[consultation-context] GET error', error);
    return internalError();
  }
};
