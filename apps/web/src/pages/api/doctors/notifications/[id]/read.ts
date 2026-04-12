import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { doctorNotificationsService } from '@/lib/doctors/services/notifications.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const notificationId = params.id?.trim();
  if (!notificationId) {
    return badRequest('notification id is required');
  }

  const context = await resolveDoctorContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    await doctorNotificationsService.markRead(admin, context, notificationId);
    return jsonOk({ ok: true });
  } catch (error) {
    logger.error('[doctors/notifications/:id/read/POST]', error);
    return internalError();
  }
};
