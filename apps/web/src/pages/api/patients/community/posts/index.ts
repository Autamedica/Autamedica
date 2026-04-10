import { badRequest, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { communityService } from '@/lib/patients/services/community.service';
import type { CreateCommunityPostInput } from '@/lib/patients/types/community';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => null)) as CreateCommunityPostInput | null;
  if (!body) {
    return badRequest('body is required');
  }

  try {
    const post = await communityService.createPost(createAstroAdminClient(locals.runtime?.env), context, body);
    return jsonOk(post, 201);
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === 'VALIDATION') {
      return badRequest((error as Error).message);
    }

    if (code === 'GROUP_NOT_FOUND') {
      return notFound((error as Error).message);
    }

    logger.error('[patients/community/posts/POST]', error);
    return internalError();
  }
};
