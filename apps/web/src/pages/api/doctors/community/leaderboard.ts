import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, internalError, unauthorized } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { rankingService } from '@/lib/doctors/services/ranking.service';

export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.session) return unauthorized();

    const admin = createAstroAdminClient();
    const result = await rankingService.getCommunityLeaderboard(admin);
    return jsonOk(result);
  } catch (err) {
    logger.error('[doctors/community/leaderboard/GET]', err);
    return internalError();
  }
};
