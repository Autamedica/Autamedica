import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { internalError, jsonOk, unauthorized } from '@/lib/api-helpers';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { notificationsService } from '@/lib/patients/services/notifications.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  try {
    const admin = createAstroAdminClient();
    await notificationsService.markAllRead(admin, context);
    return jsonOk({ ok: true });
  } catch (error) {
    logger.error('[patients/notifications/read-all/POST]', error);
    return internalError();
  }
};
