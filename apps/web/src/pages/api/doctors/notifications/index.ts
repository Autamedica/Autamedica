import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { internalError, jsonOk, unauthorized } from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { doctorNotificationsService } from '@/lib/doctors/services/notifications.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const feed = await doctorNotificationsService.getDoctorFeed(admin, context);
    return jsonOk(feed);
  } catch (error) {
    logger.error('[doctors/notifications/GET]', error);
    return internalError();
  }
};
