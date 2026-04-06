import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCommunityAdapter } from '@/lib/patients/lib/repos/community.adapter';
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

async function resolveAuthorDisplayName(
  communityRepo: ReturnType<typeof createCommunityAdapter>,
  context: PatientCommunityContext,
): Promise<string | null> {
  try {
    return await communityRepo.resolveDisplayName(context.userId);
  } catch (error) {
    logger.warn('[communityService] resolveAuthorDisplayName threw', error);
    return null;
  }
}

function resolveCommunityActor(context: PatientCommunityContext): {
  actorId: string;
  actorIds: string[];
} {
  const actorId = context.patientId;
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
    const communityRepo = createCommunityAdapter(supabase);

    const [groups, memberships, posts] = await Promise.all([
      communityRepo.listGroups().catch((error) => {
        logger.warn('[communityService] listGroups degraded to empty state', error);
        return [];
      }),
      communityRepo.listMemberships(actorIds).catch((error) => {
        logger.warn('[communityService] listMemberships degraded to empty state', error);
        return [];
      }),
      communityRepo.listPosts({
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
    const communityRepo = createCommunityAdapter(supabase);

    if (!payload.groupId.trim()) {
      throw Object.assign(new Error('El grupo es obligatorio'), { code: 'VALIDATION' });
    }

    if (!payload.content.trim()) {
      throw Object.assign(new Error('El contenido es obligatorio'), { code: 'VALIDATION' });
    }

    const group = await communityRepo.findGroupById(payload.groupId);
    if (!group) {
      throw Object.assign(new Error('Grupo no encontrado'), { code: 'GROUP_NOT_FOUND' });
    }

    const { actorId, actorIds } = resolveCommunityActor(context);
    await communityRepo.ensureMembership(actorIds, payload.groupId, actorId);

    const authorDisplayName = await resolveAuthorDisplayName(communityRepo, context);

    return communityRepo.createPost({
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
    const communityRepo = createCommunityAdapter(supabase);

    if (!payload.postId.trim()) {
      throw Object.assign(new Error('La publicacion es obligatoria'), { code: 'VALIDATION' });
    }

    const post = await communityRepo.findPostById(payload.postId);
    if (!post) {
      throw Object.assign(new Error('Publicacion no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    await communityRepo.upsertReaction({
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
    const communityRepo = createCommunityAdapter(supabase);

    if (!payload.postId.trim()) {
      throw Object.assign(new Error('La publicacion es obligatoria'), { code: 'VALIDATION' });
    }

    if (!payload.content.trim()) {
      throw Object.assign(new Error('El contenido es obligatorio'), { code: 'VALIDATION' });
    }

    const post = await communityRepo.findPostById(payload.postId);
    if (!post) {
      throw Object.assign(new Error('Publicacion no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    const authorDisplayName = await resolveAuthorDisplayName(communityRepo, context);

    return communityRepo.createComment({
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
    const communityRepo = createCommunityAdapter(supabase);

    if (!payload.postId.trim()) {
      throw Object.assign(new Error('La publicacion es obligatoria'), { code: 'VALIDATION' });
    }

    if (!payload.content.trim()) {
      throw Object.assign(new Error('El contenido es obligatorio'), { code: 'VALIDATION' });
    }

    const post = await communityRepo.findPostById(payload.postId);
    if (!post) {
      throw Object.assign(new Error('Publicacion no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    let authorDisplayName: string | null = null;
    let doctorSpecialty: string | null = null;
    try {
      const [displayName, specialty] = await Promise.all([
        communityRepo.resolveDisplayName(context.userId),
        communityRepo.findDoctorSpecialty(context.doctorId),
      ]);
      authorDisplayName = displayName;
      doctorSpecialty = specialty;
    } catch (error) {
      logger.warn('[communityService] createDoctorComment profile resolution failed', error);
    }

    return communityRepo.createComment({
      postId: payload.postId,
      doctorAuthorId: context.doctorId,
      authorDisplayName,
      authorRole: 'doctor',
      doctorSpecialtySnapshot: doctorSpecialty,
      content: payload.content.trim(),
      anonymous: false,
    });
  },

  async addCommentReaction(
    supabase: Db,
    context: PatientCommunityContext,
    payload: AddCommentReactionInput,
  ): Promise<void> {
    const communityRepo = createCommunityAdapter(supabase);

    if (!payload.commentId.trim()) {
      throw Object.assign(new Error('El comentario es obligatorio'), { code: 'VALIDATION' });
    }

    const comment = await communityRepo.findCommentById(payload.commentId);
    if (!comment) {
      throw Object.assign(new Error('Comentario no encontrado'), { code: 'COMMENT_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    await communityRepo.upsertCommentReaction({
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
    const communityRepo = createCommunityAdapter(supabase);
    const post = await communityRepo.findPostById(postId);
    if (!post) {
      throw Object.assign(new Error('Publicacion no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    if (post.author_id !== actorId) {
      throw Object.assign(new Error('No podes editar esta publicacion'), { code: 'FORBIDDEN' });
    }

    return communityRepo.updatePost(postId, {
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
    const communityRepo = createCommunityAdapter(supabase);
    const post = await communityRepo.findPostById(postId);
    if (!post) {
      throw Object.assign(new Error('Publicacion no encontrada'), { code: 'POST_NOT_FOUND' });
    }

    const { actorId } = resolveCommunityActor(context);
    if (post.author_id !== actorId) {
      throw Object.assign(new Error('No podes eliminar esta publicacion'), { code: 'FORBIDDEN' });
    }

    await communityRepo.deletePost(postId);
  },

  async getDoctorFeed(
    supabase: Db,
    context: { userId: string; doctorId: string },
    options?: {
      limit?: number;
      sortBy?: CommunitySortBy;
    },
  ): Promise<CommunityPost[]> {
    const limit = options?.limit ?? 20;
    const sortBy = options?.sortBy ?? 'recent';
    const communityRepo = createCommunityAdapter(supabase);

    try {
      const posts = await communityRepo.listPosts({ limit, sortBy });
      if (posts.length === 0) return [];

      const postIds = posts.map(p => p.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: comments } = await (supabase as any)
        .from('community_post_comments')
        .select('post_id')
        .in('post_id', postIds)
        .eq('doctor_author_id', context.doctorId)
        .is('deleted_at', null);

      const commentedPostIds = new Set((comments || []).map((c: unknown) => (c as { post_id: string }).post_id));

      return posts.map(post => ({
        ...post,
        viewer_has_commented: commentedPostIds.has(post.id)
      }));
    } catch (error) {
      logger.warn('[communityService] getDoctorFeed degraded to empty state', error);
      return [];
    }
  },
};
