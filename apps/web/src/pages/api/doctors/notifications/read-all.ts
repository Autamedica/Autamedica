import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { internalError, jsonOk, unauthorized } from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { doctorNotificationsService } from '@/lib/doctors/services/notifications.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    await doctorNotificationsService.markAllRead(admin, context);
    return jsonOk({ ok: true });
  } catch (error) {
    logger.error('[doctors/notifications/read-all/POST]', error);
    return internalError();
  }
};
