import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, internalError } from '@/lib/api-helpers';
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { rankingService } from '@/lib/doctors/services/ranking.service';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;

    const admin = createAstroAdminClient(locals.runtime?.env);
    const result = await rankingService.getLeaderboard(admin, auth.user.id);
    return jsonOk(result);
  } catch (err) {
    logger.error('Ranking API error:', err);
    return internalError();
  }
};
