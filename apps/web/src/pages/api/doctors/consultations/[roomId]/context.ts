import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';

import { consultationContextService } from '@/lib/doctors/services/consultation-context.service';

export const GET: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) return badRequest('missing_room_id');

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;

    const admin = createAstroAdminClient(locals.runtime?.env);

    const doctorId = await consultationContextService.verifyDoctorAccess(admin, auth.user.id);
    if (!doctorId) return forbidden('doctor_not_found');

    const result = await consultationContextService.getContext(admin, roomId);
    return jsonOk(result);
  } catch (error) {
    logger.error('[consultation-context] GET error', error);
    return internalError();
  }
};
