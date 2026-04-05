import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CommunityComment,
  CommunityGroup,
  CommunityMembership,
  CommunityPost,
  CommunitySortBy,
} from '@/lib/patients/types/community';
import type { ICommunityRepository } from '@/lib/patients/ports/community.port';

type Db = SupabaseClient<Database>;
type DbScalar = string | number | boolean | null;
type DbRow = Record<string, unknown>;

interface DbError extends Error {
  code?: string;
}

interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

interface DbQueryBuilder
  extends PromiseLike<{ data: DbRow | DbRow[] | null; error: DbError | null }> {
  select(columns: string): DbQueryBuilder;
  eq(column: string, value: DbScalar): DbQueryBuilder;
  neq(column: string, value: DbScalar): DbQueryBuilder;
  is(column: string, value: DbScalar): DbQueryBuilder;
  in(column: string, values: string[]): DbQueryBuilder;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): DbQueryBuilder;
  limit(count: number): DbQueryBuilder;
  insert(values: DbRow | DbRow[]): DbQueryBuilder;
  upsert(values: DbRow, options?: { onConflict?: string }): DbQueryBuilder;
  single(): Promise<DbResult<DbRow>>;
  maybeSingle(): Promise<DbResult<DbRow>>;
}

interface LooseDb {
  from(relation: string): DbQueryBuilder;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapGroup(row: DbRow): CommunityGroup {
  return {
    id: asText(row.id) ?? '',
    name: asText(row.name) ?? 'Grupo',
    slug: asText(row.slug) ?? '',
    description: asText(row.description),
    category: asText(row.category),
    member_count: asNumber(row.member_count),
    post_count: asNumber(row.post_count),
    icon: asText(row.icon),
    tags: asStringArray(row.tags),
  };
}

function mapMembership(row: DbRow): CommunityMembership {
  return {
    id: asText(row.id) ?? '',
    group_id: asText(row.group_id) ?? '',
    patient_id: asText(row.patient_id) ?? '',
    status: asText(row.status) ?? 'active',
    role: asText(row.role),
    post_count: asNumber(row.post_count),
    comment_count: asNumber(row.comment_count),
    helpful_reactions_received: asNumber(row.helpful_reactions_received),
    last_active: asText(row.last_active),
  };
}

function mapComment(row: DbRow): CommunityComment {
  const authorRole = asText(row.author_role) === 'doctor' ? 'doctor' : 'patient';

  return {
    id: asText(row.id) ?? '',
    post_id: asText(row.post_id) ?? '',
    author_id: asText(row.author_id) ?? asText(row.doctor_author_id) ?? '',
    author_display_name: asText(row.author_display_name),
    author_role: authorRole,
    doctor_specialty: asText(row.doctor_specialty_snapshot) ?? asText(row.doctor_specialty),
    content: asText(row.content) ?? '',
    is_anonymous: asBoolean(row.is_anonymous),
    reaction_count: asNumber(row.reaction_count),
    created_at: asText(row.created_at) ?? new Date().toISOString(),
    post_title: asText(row.post_title),
  };
}

function mapPost(row: DbRow): CommunityPost {
  const group = row.group;

  return {
    id: asText(row.id) ?? '',
    group_id: asText(row.group_id) ?? '',
    author_id: asText(row.author_id) ?? '',
    author_display_name: asText(row.author_display_name),
    is_anonymous: asBoolean(row.is_anonymous),
    title: asText(row.title) ?? '',
    content: asText(row.content) ?? '',
    tags: asStringArray(row.tags),
    moderation_status: asText(row.moderation_status) ?? 'approved',
    reaction_count: asNumber(row.reaction_count),
    comment_count: asNumber(row.comment_count),
    view_count: asNumber(row.view_count),
    created_at: asText(row.created_at) ?? new Date().toISOString(),
    group:
      group && typeof group === 'object' && !Array.isArray(group)
        ? mapGroup(group as DbRow)
        : null,
  };
}

export function createCommunityAdapter(supabase: Db): ICommunityRepository {
  const db = supabase as unknown as LooseDb;

  return {
    async listGroups(): Promise<CommunityGroup[]> {
      const { data, error } = await db
        .from('community_groups')
        .select('*')
        .is('deleted_at', null)
        .order('member_count', { ascending: false });

      if (error) {
        logger.error('[communityRepo] listGroups failed', error);
        throw error;
      }

      return Array.isArray(data) ? data.map((row) => mapGroup(row as DbRow)) : [];
    },

    async listMemberships(actorIds: string[]): Promise<CommunityMembership[]> {
      if (actorIds.length === 0) {
        return [];
      }

      const { data, error } = await db
        .from('group_memberships')
        .select('*')
        .in('patient_id', actorIds)
        .eq('status', 'active');

      if (error) {
        logger.error('[communityRepo] listMemberships failed', error);
        throw error;
      }

      return Array.isArray(data) ? data.map((row) => mapMembership(row as DbRow)) : [];
    },

    async listPosts(
      options: {
        limit: number;
        sortBy: CommunitySortBy;
        groupId?: string;
      },
    ): Promise<CommunityPost[]> {
      let query = db
        .from('community_posts')
        .select('*, group:community_groups(*)')
        .eq('moderation_status', 'approved')
        .is('deleted_at', null)
        .limit(options.limit);

      if (options.groupId) {
        query = query.eq('group_id', options.groupId);
      }

      query =
        options.sortBy === 'popular'
          ? query.order('reaction_count', { ascending: false }).order('created_at', { ascending: false })
          : query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        logger.error('[communityRepo] listPosts failed', error);
        throw error;
      }

      return Array.isArray(data) ? data.map((row) => mapPost(row as DbRow)) : [];
    },

    async findGroupById(groupId: string): Promise<CommunityGroup | null> {
      const { data, error } = await db
        .from('community_groups')
        .select('*')
        .eq('id', groupId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        logger.error('[communityRepo] findGroupById failed', error);
        throw error;
      }

      return data ? mapGroup(data as DbRow) : null;
    },

    async listCommentsByPostId(postId: string): Promise<CommunityComment[]> {
      const { data, error } = await db
        .from('community_post_comments')
        .select('*')
        .eq('post_id', postId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('[communityRepo] listCommentsByPostId failed', error);
        throw error;
      }

      return Array.isArray(data) ? data.map((row) => mapComment(row as DbRow)) : [];
    },

    async findPostById(postId: string): Promise<CommunityPost | null> {
      const { data, error } = await db
        .from('community_posts')
        .select('*, group:community_groups(*)')
        .eq('id', postId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        logger.error('[communityRepo] findPostById failed', error);
        throw error;
      }

      return data ? mapPost(data as DbRow) : null;
    },

    async ensureMembership(
      actorIds: string[],
      groupId: string,
      primaryActorId: string,
    ): Promise<void> {
      const { data, error } = await db
        .from('group_memberships')
        .select('id')
        .eq('group_id', groupId)
        .in('patient_id', actorIds)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        logger.error('[communityRepo] ensureMembership lookup failed', error);
        throw error;
      }

      if (data) {
        return;
      }

      const { error: insertError } = await db.from('group_memberships').insert({
        group_id: groupId,
        patient_id: primaryActorId,
        role: 'member',
        status: 'active',
      });

      if (insertError) {
        logger.error('[communityRepo] ensureMembership insert failed', insertError);
        throw insertError;
      }
    },

    async createPost(
      payload: {
        groupId: string;
        authorId: string;
        authorDisplayName: string | null;
        title?: string;
        content: string;
        anonymous: boolean;
        tags: string[];
      },
    ): Promise<CommunityPost> {
      const { data, error } = await db
        .from('community_posts')
        .insert({
          group_id: payload.groupId,
          author_id: payload.authorId,
          author_display_name: payload.anonymous ? 'Anonimo' : payload.authorDisplayName,
          title: payload.title?.trim() ? payload.title.trim() : null,
          content: payload.content,
          is_anonymous: payload.anonymous,
          tags: payload.tags,
          moderation_status: 'approved',
        })
        .select('*, group:community_groups(*)')
        .single();

      if (error) {
        logger.error('[communityRepo] createPost failed', error);
        throw error;
      }

      return mapPost(data as DbRow);
    },

    async upsertReaction(
      payload: {
        postId: string;
        actorId: string;
        reactionType: string;
      },
    ): Promise<void> {
      const { error } = await db.from('post_reactions').upsert(
        {
          post_id: payload.postId,
          user_id: payload.actorId,
          reaction_type: payload.reactionType,
        },
        { onConflict: 'post_id,user_id' },
      );

      if (error) {
        logger.error('[communityRepo] upsertReaction failed', error);
        throw error;
      }
    },

    async listRecentCommentsOnPatientPosts(
      patientId: string,
      limit: number,
    ): Promise<CommunityComment[]> {
      const { data: posts, error: postsError } = await db
        .from('community_posts')
        .select('id, title')
        .eq('author_id', patientId)
        .is('deleted_at', null);

      if (postsError) {
        logger.error('[communityRepo] listRecentCommentsOnPatientPosts posts lookup failed', postsError);
        throw postsError;
      }

      const postIds = Array.isArray(posts) ? posts.map((p) => asText((p as DbRow).id) ?? '') : [];
      if (postIds.length === 0) {
        return [];
      }

      const postTitleMap = new Map(
        Array.isArray(posts)
          ? posts.map((p) => [asText((p as DbRow).id) ?? '', asText((p as DbRow).title)])
          : [],
      );

      const { data: comments, error: commentsError } = await db
        .from('community_post_comments')
        .select('*')
        .in('post_id', postIds)
        .neq('author_id', patientId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (commentsError) {
        logger.error('[communityRepo] listRecentCommentsOnPatientPosts comments lookup failed', commentsError);
        throw commentsError;
      }

      return Array.isArray(comments)
        ? comments.map((row) => {
            const mapped = mapComment(row as DbRow);
            mapped.post_title = postTitleMap.get(mapped.post_id) ?? null;
            return mapped;
          })
        : [];
    },

    async createComment(
      payload: {
        postId: string;
        authorId?: string;
        doctorAuthorId?: string;
        authorDisplayName: string | null;
        authorRole: 'patient' | 'doctor';
        doctorSpecialtySnapshot?: string | null;
        content: string;
        anonymous: boolean;
      },
    ): Promise<CommunityComment> {
      const { data, error } = await db
        .from('community_post_comments')
        .insert({
          post_id: payload.postId,
          author_id: payload.authorRole === 'patient' ? payload.authorId ?? null : null,
          doctor_author_id: payload.authorRole === 'doctor' ? payload.doctorAuthorId ?? null : null,
          author_display_name: payload.anonymous ? 'Anonimo' : payload.authorDisplayName,
          author_role: payload.authorRole,
          doctor_specialty_snapshot: payload.authorRole === 'doctor' ? payload.doctorSpecialtySnapshot ?? null : null,
          content: payload.content,
          is_anonymous: payload.anonymous,
        })
        .select('*')
        .single();

      if (error) {
        logger.error('[communityRepo] createComment failed', error);
        throw error;
      }

      return mapComment(data as DbRow);
    },

    async findCommentById(commentId: string): Promise<CommunityComment | null> {
      const { data, error } = await db
        .from('community_post_comments')
        .select('*')
        .eq('id', commentId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        logger.error('[communityRepo] findCommentById failed', error);
        throw error;
      }

      return data ? mapComment(data as DbRow) : null;
    },

    async upsertCommentReaction(
      payload: {
        commentId: string;
        actorId: string;
        reactionType: string;
      },
    ): Promise<void> {
      const { error } = await db.from('community_comment_reactions').upsert(
        {
          comment_id: payload.commentId,
          user_id: payload.actorId,
          reaction_type: payload.reactionType,
        },
        { onConflict: 'comment_id,user_id' },
      );

      if (error) {
        logger.error('[communityRepo] upsertCommentReaction failed', error);
        throw error;
      }
    },

    async updatePost(
      postId: string,
      payload: {
        title?: string;
        content?: string;
        tags?: string[];
      },
    ): Promise<CommunityPost> {
      const updates: DbRow = {};
      if (payload.title !== undefined) {
        updates.title = payload.title.trim() || null;
      }
      if (payload.content !== undefined) {
        updates.content = payload.content.trim();
      }
      if (payload.tags !== undefined) {
        updates.tags = payload.tags;
      }
      updates.updated_at = new Date().toISOString();

      const { error: updateError } = await db
        .from('community_posts')
        .upsert({ id: postId, ...updates }, { onConflict: 'id' });

      if (updateError) {
        logger.error('[communityRepo] updatePost failed', updateError);
        throw updateError;
      }

      const { data, error: fetchError } = await db
        .from('community_posts')
        .select('*, group:community_groups(*)')
        .eq('id', postId)
        .single();

      if (fetchError) {
        logger.error('[communityRepo] updatePost re-fetch failed', fetchError);
        throw fetchError;
      }

      return mapPost(data as DbRow);
    },

    async deletePost(postId: string): Promise<void> {
      const { error } = await db
        .from('community_posts')
        .upsert(
          { id: postId, deleted_at: new Date().toISOString() },
          { onConflict: 'id' },
        );

      if (error) {
        logger.error('[communityRepo] deletePost failed', error);
        throw error;
      }
    },

    async resolveDisplayName(userId: string): Promise<string | null> {
      const { data, error } = await db
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        logger.warn('[communityRepo] resolveDisplayName failed', error);
        return null;
      }

      if (!data) return null;
      const row = data as DbRow;
      const fullName = [asText(row.first_name), asText(row.last_name)]
        .filter(Boolean)
        .join(' ')
        .trim();
      return fullName.length > 0 ? fullName : null;
    },

    async findDoctorSpecialty(doctorId: string): Promise<string | null> {
      const { data, error } = await db
        .from('doctors')
        .select('specialty')
        .eq('id', doctorId)
        .maybeSingle();

      if (error) {
        logger.warn('[communityRepo] findDoctorSpecialty failed', error);
        return null;
      }

      return data ? asText((data as DbRow).specialty) : null;
    },
  };
}
