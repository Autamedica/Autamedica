import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, internalError, unauthorized } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { rankingService } from '@/lib/doctors/services/ranking.service';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const session = locals.session;
    if (!session) return unauthorized();

    const admin = createAstroAdminClient();
    const result = await rankingService.getLeaderboard(admin, session.user.id);
    return jsonOk(result);
  } catch (err) {
    logger.error('Ranking API error:', err);
    return internalError();
  }
};
