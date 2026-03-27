import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CommunityGroup,
  CommunityMembership,
  CommunityPost,
  CommunitySortBy,
} from '@/lib/patients/types/community';

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

export const communityRepo = {
  async listGroups(supabase: Db): Promise<CommunityGroup[]> {
    const db = supabase as unknown as LooseDb;
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

  async listMemberships(supabase: Db, actorIds: string[]): Promise<CommunityMembership[]> {
    if (actorIds.length === 0) {
      return [];
    }

    const db = supabase as unknown as LooseDb;
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
    supabase: Db,
    options: {
      limit: number;
      sortBy: CommunitySortBy;
      groupId?: string;
    },
  ): Promise<CommunityPost[]> {
    const db = supabase as unknown as LooseDb;
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

  async findGroupById(supabase: Db, groupId: string): Promise<CommunityGroup | null> {
    const db = supabase as unknown as LooseDb;
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

  async findPostById(supabase: Db, postId: string): Promise<CommunityPost | null> {
    const db = supabase as unknown as LooseDb;
    const { data, error } = await db
      .from('community_posts')
      .select('*, group:community_groups(*)')
      .eq('id', postId)
      .maybeSingle();

    if (error) {
      logger.error('[communityRepo] findPostById failed', error);
      throw error;
    }

    return data ? mapPost(data as DbRow) : null;
  },

  async ensureMembership(
    supabase: Db,
    actorIds: string[],
    groupId: string,
    primaryActorId: string,
  ): Promise<void> {
    const db = supabase as unknown as LooseDb;
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
    supabase: Db,
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
    const db = supabase as unknown as LooseDb;
    const { data, error } = await db
      .from('community_posts')
      .insert({
        group_id: payload.groupId,
        author_id: payload.authorId,
        author_display_name: payload.anonymous ? 'Anónimo' : payload.authorDisplayName,
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
    supabase: Db,
    payload: {
      postId: string;
      actorId: string;
      reactionType: string;
    },
  ): Promise<void> {
    const db = supabase as unknown as LooseDb;
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
};
