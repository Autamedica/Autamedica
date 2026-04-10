import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { notificationsService } from '@/lib/patients/services/notifications.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const notificationId = params.id?.trim();
  if (!notificationId) {
    return badRequest('notification id is required');
  }

  const context = await resolvePatientContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    await notificationsService.markRead(admin, context, notificationId);
    return jsonOk({ ok: true });
  } catch (error) {
    logger.error('[patients/notifications/:id/read/POST]', error);
    return internalError();
  }
};
