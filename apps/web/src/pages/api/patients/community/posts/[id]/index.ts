import {
  badRequest,
  forbidden,
  internalError,
  jsonOk,
  notFound,
  unauthorized,
} from '@/lib/api-helpers';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { communityService } from '@/lib/patients/services/community.service';
import type { UpdateCommunityPostInput } from '@/lib/patients/types/community';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { APIRoute } from 'astro';

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  const postId = params.id;
  if (!postId?.trim()) {
    return badRequest('post id is required');
  }

  const body = (await request.json().catch(() => null)) as UpdateCommunityPostInput | null;
  if (!body) {
    return badRequest('body is required');
  }

  try {
    const post = await communityService.updatePost(createAstroAdminClient(locals.runtime?.env), context, postId, body);
    return jsonOk(post);
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === 'VALIDATION') {
      return badRequest((error as Error).message);
    }

    if (code === 'FORBIDDEN' || code === 'GROUP_RESTRICTED') {
      return forbidden((error as Error).message);
    }

    if (code === 'POST_NOT_FOUND') {
      return notFound((error as Error).message);
    }

    logger.error('[patients/community/posts/:id/PATCH]', error);
    return internalError();
  }
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  const postId = params.id;
  if (!postId?.trim()) {
    return badRequest('post id is required');
  }

  try {
    await communityService.deletePost(createAstroAdminClient(locals.runtime?.env), context, postId);
    return jsonOk({ success: true });
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === 'FORBIDDEN') {
      return forbidden((error as Error).message);
    }

    if (code === 'POST_NOT_FOUND') {
      return notFound((error as Error).message);
    }

    logger.error('[patients/community/posts/:id/DELETE]', error);
    return internalError();
  }
};
