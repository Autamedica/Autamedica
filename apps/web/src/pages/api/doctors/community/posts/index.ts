import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { communityService } from '@/lib/patients/services/community.service';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const sortBy = url.searchParams.get('sort_by');
  const limit = limitParam ? Number(limitParam) : undefined;

  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0 || limit > 50)) {
    return badRequest('limit must be between 1 and 50');
  }

  if (sortBy && sortBy !== 'recent' && sortBy !== 'popular') {
    return badRequest('sort_by must be recent or popular');
  }

  try {
    const posts = await communityService.getDoctorFeed(createAstroAdminClient(), context, {
      limit,
      sortBy: sortBy === 'popular' ? 'popular' : 'recent',
    });
    return jsonOk({ posts });
  } catch (error) {
    logger.error('[doctors/community/posts/GET]', error);
    return internalError();
  }
};
