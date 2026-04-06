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
import { createAstroServerClientFromRequest } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) {
    return unauthorized();
  }

  const commentId = params.id;
  if (!commentId?.trim()) {
    return badRequest('comment id is required');
  }

  const body = (await request.json().catch(() => null)) as { reactionType?: string } | null;

  try {
    await communityService.addCommentReaction(createAstroServerClientFromRequest(request), context, {
      commentId,
      reactionType: body?.reactionType ?? 'helpful',
    });
    return jsonOk({ success: true });
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === 'VALIDATION') {
      return badRequest((error as Error).message);
    }

    if (code === 'FORBIDDEN' || code === 'GROUP_RESTRICTED') {
      return forbidden((error as Error).message);
    }

    if (code === 'COMMENT_NOT_FOUND' || code === 'POST_NOT_FOUND') {
      return notFound((error as Error).message);
    }

    logger.error('[patients/community/comments/:id/reactions/POST]', error);
    return internalError();
  }
};
