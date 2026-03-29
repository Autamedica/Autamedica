import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { communityRepo } from '@/lib/patients/lib/repos/community.repo';
import type {
  AddCommentReactionInput,
  AddCommunityReactionInput,
  CommunityComment,
  CommunityOverview,
  CommunityPost,
  CommunitySortBy,
  CreateCommunityCommentInput,
  CreateCommunityPostInput,
  UpdateCommunityPostInput,
} from '@/lib/patients/types/community';

type Db = SupabaseClient<Database>;

interface PatientCommunityContext {
  userId: string;
  patientId: string;
}

function normalizeTags(input: string[] | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag, index, tags) => tag.length > 0 && tags.indexOf(tag) === index)
    .slice(0, 5);
}

function buildDisplayName(profile: {
  first_name?: string | null;
  last_name?: string | null;
} | null): string | null {
  if (!profile) {
    return null;
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return fullName.length > 0 ? fullName : null;
}

async function resolveAuthorDisplayName(
  supabase: Db,
  context: PatientCommunityContext,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', context.userId)
      .maybeSingle();

    if (error) {
      logger.warn('[communityService] resolveAuthorDisplayName failed', error);
      return null;
    }

    return buildDisplayName(data);
  } catch (error) {
    logger.warn('[communityService] resolveAuthorDisplayName threw', error);
    return null;
  }
}

function resolveCommunityActor(context: PatientCommunityContext): {
  actorId: string;
  actorIds: string[];
} {
  // Community writes historically keyed by auth user id in production flows.
  // Keep that effective contract here until the DB contract is audited and normalized.
  const actorId = context.userId;
  const actorIds = Array.from(new Set([context.userId, context.patientId].filter(Boolean)));

  return { actorId, actorIds };
}

export const communityService = {
  async getOverview(
    supabase: Db,
    context: PatientCommunityContext,
    options?: {
      limit?: number;
      sortBy?: CommunitySortBy;
      groupId?: string;
    },
  ): Promise<CommunityOverview> {
    const limit = options?.limit ?? 20;
    const sortBy = options?.sortBy ?? 'recent';
    const { actorIds } = resolveCommunityActor(context);

    const [groups, memberships, posts] = await Promise.all([
      communityRepo.listGroups(supabase).catch((error) => {
        logger.warn('[communityService] listGroups degraded to empty state', error);
        return [];
      }),
      communityRepo.listMemberships(supabase, actorIds).catch((error) => {
        logger.warn('[communityService] listMemberships degraded to empty state', error);
        return [];
      }),
      communityRepo.listPosts(supabase, {
        limit,
        sortBy,
        groupId: options?.groupId,
      }).catch((error) => {
        logger.warn('[communityService] listPosts degraded to empty state', error);
        return [];
      }),
    ]);

    return {
      viewer: {
        userId: context.userId,
        patientId: context.patientId,
      },
      groups,
      memberships,
      posts,
    };
  },

  async createPost(
    supabase: Db,
    context: PatientCommunityContext,
    payload: CreateCommunityPostInput,
  ) {
    if (!payload.groupId.trim()) {
      throw Object.assign(new Error('El grupo es obligatorio'), { code: 'VALIDATION' });
    }

    if (!payload.content.trim()) {
      throw Object.assign(new Error('El contenido es obligatorio'), { code: 'VALIDATION' });
    }

    const group = await communityRepo.findGroupById(supabase, payload.groupId);
    if (!group) {
      throw Object.assign(new Error('Grupo no encontrado'), { code: 'GROUP_NOT_FOUND' });
    }

    const { actorId, actorIds } = resolveCommunityActor(context);
    await communityRepo.ensureMembership(supabase, actorIds, payload.groupId, actorId);

    const authorDisplayName = await resolveAuthorDisplayName(supabase, context);

    return communityRepo.createPost(supabase, {
      groupId: payload.groupId,
      authorId: actorId,
      authorDisplayName,
      title: payload.title,
      content: payload.content.trim(),
      anonymous: payload.anonymous ?? false,
      tags: normalizeTags(payload.tags),
    });
  },

  async addReaction(
    supabase: Db,
    context: PatientCommunityContext,
    payload: AddCommunityReactionInput,
  ): Promise<void> {
    if (!payload.postId.trim()) {
      throw Object.assign(new Error('La publicación es obligatoria'), { code: 'VALIDATION' });
    }

    const post = await communityRepo.findPostById(supabase, payload.postId);
    if (!post) {
      throw Object.assign(new Error('Publicación no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    await communityRepo.upsertReaction(supabase, {
      postId: payload.postId,
      actorId,
      reactionType: payload.reactionType.trim() || 'like',
    });
  },

  async createComment(
    supabase: Db,
    context: PatientCommunityContext,
    payload: CreateCommunityCommentInput,
  ): Promise<CommunityComment> {
    if (!payload.postId.trim()) {
      throw Object.assign(new Error('La publicación es obligatoria'), { code: 'VALIDATION' });
    }

    if (!payload.content.trim()) {
      throw Object.assign(new Error('El contenido es obligatorio'), { code: 'VALIDATION' });
    }

    const post = await communityRepo.findPostById(supabase, payload.postId);
    if (!post) {
      throw Object.assign(new Error('Publicación no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    const authorDisplayName = await resolveAuthorDisplayName(supabase, context);

    return communityRepo.createComment(supabase, {
      postId: payload.postId,
      authorId: actorId,
      authorDisplayName,
      authorRole: 'patient',
      content: payload.content.trim(),
      anonymous: payload.anonymous ?? false,
    });
  },

  async createDoctorComment(
    supabase: Db,
    context: { userId: string; doctorId: string },
    payload: { postId: string; content: string },
  ): Promise<CommunityComment> {
    if (!payload.postId.trim()) {
      throw Object.assign(new Error('La publicación es obligatoria'), { code: 'VALIDATION' });
    }

    if (!payload.content.trim()) {
      throw Object.assign(new Error('El contenido es obligatorio'), { code: 'VALIDATION' });
    }

    const post = await communityRepo.findPostById(supabase, payload.postId);
    if (!post) {
      throw Object.assign(new Error('Publicación no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    // Resolve doctor display name and specialty
    let authorDisplayName: string | null = null;
    let doctorSpecialty: string | null = null;
    try {
      const [profileResult, doctorResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', context.userId)
          .maybeSingle(),
        supabase
          .from('doctors')
          .select('specialty')
          .eq('id', context.doctorId)
          .maybeSingle(),
      ]);
      authorDisplayName = buildDisplayName(profileResult.data);
      doctorSpecialty = doctorResult.data?.specialty ?? null;
    } catch (error) {
      logger.warn('[communityService] createDoctorComment profile resolution failed', error);
    }

    return communityRepo.createComment(supabase, {
      postId: payload.postId,
      authorId: context.userId,
      authorDisplayName,
      authorRole: 'doctor',
      doctorSpecialty,
      content: payload.content.trim(),
      anonymous: false,
    });
  },

  async addCommentReaction(
    supabase: Db,
    context: PatientCommunityContext,
    payload: AddCommentReactionInput,
  ): Promise<void> {
    if (!payload.commentId.trim()) {
      throw Object.assign(new Error('El comentario es obligatorio'), { code: 'VALIDATION' });
    }

    const comment = await communityRepo.findCommentById(supabase, payload.commentId);
    if (!comment) {
      throw Object.assign(new Error('Comentario no encontrado'), { code: 'COMMENT_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    await communityRepo.upsertCommentReaction(supabase, {
      commentId: payload.commentId,
      actorId,
      reactionType: payload.reactionType.trim() || 'helpful',
    });
  },

  async updatePost(
    supabase: Db,
    context: PatientCommunityContext,
    postId: string,
    payload: UpdateCommunityPostInput,
  ): Promise<CommunityPost> {
    const post = await communityRepo.findPostById(supabase, postId);
    if (!post) {
      throw Object.assign(new Error('Publicación no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    if (post.author_id !== actorId) {
      throw Object.assign(new Error('No podés editar esta publicación'), { code: 'FORBIDDEN' });
    }

    return communityRepo.updatePost(supabase, postId, {
      title: payload.title,
      content: payload.content,
      tags: payload.tags ? normalizeTags(payload.tags) : undefined,
    });
  },

  async deletePost(
    supabase: Db,
    context: PatientCommunityContext,
    postId: string,
  ): Promise<void> {
    const post = await communityRepo.findPostById(supabase, postId);
    if (!post) {
      throw Object.assign(new Error('Publicación no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    if (post.author_id !== actorId) {
      throw Object.assign(new Error('No podés eliminar esta publicación'), { code: 'FORBIDDEN' });
    }

    await communityRepo.deletePost(supabase, postId);
  },

  async getDoctorFeed(
    supabase: Db,
    _context: { userId: string; doctorId: string },
    options?: {
      limit?: number;
      sortBy?: CommunitySortBy;
    },
  ): Promise<CommunityPost[]> {
    const limit = options?.limit ?? 20;
    const sortBy = options?.sortBy ?? 'recent';

    return communityRepo.listPosts(supabase, { limit, sortBy }).catch((error) => {
      logger.warn('[communityService] getDoctorFeed degraded to empty state', error);
      return [];
    });
  },
};
