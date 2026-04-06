import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { communityService } from '@/lib/patients/services/community.service';
import { createAstroServerClientFromRequest } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const sortBy = url.searchParams.get('sort_by');
  const limitParam = url.searchParams.get('limit');
  const groupId = url.searchParams.get('group_id') ?? undefined;
  const limit = limitParam ? Number(limitParam) : undefined;

  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0 || limit > 50)) {
    return badRequest('limit must be between 1 and 50');
  }

  if (sortBy && sortBy !== 'recent' && sortBy !== 'popular') {
    return badRequest('sort_by must be recent or popular');
  }

  try {
    const overview = await communityService.getOverview(createAstroServerClientFromRequest(request), context, {
      limit,
      sortBy: sortBy === 'popular' ? 'popular' : 'recent',
      groupId,
    });

    return jsonOk(overview);
  } catch (error) {
    logger.error('[patients/community/GET]', error);
    return internalError();
  }
};
