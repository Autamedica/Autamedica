import {
  badRequest,
  internalError,
  jsonOk,
  notFound,
  unauthorized,
} from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { communityService } from '@/lib/patients/services/community.service';
import type { CreateCommunityCommentInput } from '@/lib/patients/types/community';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, params, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  const postId = params.id;
  if (!postId?.trim()) {
    return badRequest('post id is required');
  }

  const body = (await request.json().catch(() => null)) as Omit<CreateCommunityCommentInput, 'postId'> | null;
  if (!body) {
    return badRequest('body is required');
  }

  try {
    const comment = await communityService.createDoctorComment(createAstroAdminClient(), context, {
      postId,
      content: body.content ?? '',
    });
    return jsonOk(comment, 201);
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === 'VALIDATION') {
      return badRequest((error as Error).message);
    }

    if (code === 'POST_NOT_FOUND') {
      return notFound((error as Error).message);
    }

    logger.error('[doctors/community/posts/:id/comments/POST]', error);
    return internalError();
  }
};
