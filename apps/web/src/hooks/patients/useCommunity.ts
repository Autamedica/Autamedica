'use client';

import { communityBrowserService } from '@/lib/patients/services/community.browser';
import type {
  CommunityGroup,
  CommunityMembership,
  CommunityPost,
  CommunitySortBy,
  CreateCommunityPostInput,
} from '@/lib/patients/types/community';
import { logger } from '@autamedica/shared';
import { useSupabase } from '@autamedica/auth/react';
import { useCallback, useEffect, useState } from 'react';

interface LoadPostsOptions {
  sort_by?: CommunitySortBy;
  limit?: number;
  group_id?: string;
}

interface UseCommunityReturn {
  groups: CommunityGroup[];
  memberships: CommunityMembership[];
  posts: CommunityPost[];
  loading: boolean;
  error: string | null;
  loadGroups: () => Promise<void>;
  loadPosts: (options?: LoadPostsOptions) => Promise<void>;
  refresh: (options?: LoadPostsOptions) => Promise<void>;
  createPost: (payload: {
    groupId: string;
    content: string;
    title?: string;
    anonymous?: boolean;
    tags?: string[];
  }) => Promise<void>;
  addReaction: (payload: { postId: string; reactionType: string }) => Promise<void>;
}

const DEFAULT_POST_LIMIT = 10;

export type { CommunityGroup, CommunityPost, CommunityMembership };

export function useCommunity(): UseCommunityReturn {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [memberships, setMemberships] = useState<CommunityMembership[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyOverview = useCallback(
    (overview: {
      groups: CommunityGroup[];
      memberships: CommunityMembership[];
      posts: CommunityPost[];
    }) => {
      setGroups(overview.groups);
      setMemberships(overview.memberships);
      setPosts(overview.posts);
    },
    [],
  );

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setError(null);

    try {
      const overview = await communityBrowserService.getOverview({ limit: 1 });
      setGroups(overview.groups);
      setMemberships(overview.memberships);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar grupos';
      setError(message);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadPosts = useCallback(async (options: LoadPostsOptions = {}) => {
    const { sort_by = 'recent', limit = DEFAULT_POST_LIMIT, group_id } = options;

    setPostsLoading(true);
    setError(null);

    try {
      const overview = await communityBrowserService.getOverview({
        sortBy: sort_by,
        limit,
        groupId: group_id,
      });

      applyOverview(overview);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar publicaciones';
      setError(message);
    } finally {
      setPostsLoading(false);
    }
  }, [applyOverview]);

  const refresh = useCallback(
    async (options: LoadPostsOptions = {}) => {
      await loadPosts(options);
    },
    [loadPosts],
  );

  const createPost = useCallback(
    async (payload: {
      groupId: string;
      content: string;
      title?: string;
      anonymous?: boolean;
      tags?: string[];
    }) => {
      await communityBrowserService.createPost({
        groupId: payload.groupId,
        content: payload.content,
        title: payload.title,
        anonymous: payload.anonymous,
        tags: payload.tags,
      } satisfies CreateCommunityPostInput);

      await loadPosts();
    },
    [loadPosts],
  );

  const addReaction = useCallback(
    async (payload: { postId: string; reactionType: string }) => {
      await communityBrowserService.addReaction(payload);
      await loadPosts();
    },
    [loadPosts],
  );

  const loading = groupsLoading || postsLoading;

  return {
    groups,
    memberships,
    posts,
    loading,
    error,
    loadGroups,
    loadPosts,
    refresh,
    createPost,
    addReaction,
  };
}

export function useCommunityGroups() {
  const { groups, loading, error, loadGroups } = useCommunity();

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return { groups, loading, error };
}

export function useCommunityPosts(limit = DEFAULT_POST_LIMIT) {
  const { posts, loading, error, loadPosts } = useCommunity();

  useEffect(() => {
    loadPosts({ limit });
  }, [limit, loadPosts]);

  const refetch = useCallback(() => loadPosts({ limit }), [limit, loadPosts]);

  return { posts, loading, error, refetch };
}

export function useAutoJoinGroup() {
  const supabase = useSupabase();

  const autoJoin = useCallback(
    async (groupId: string) => {
      if (!supabase || !groupId.trim()) {
        return;
      }

      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) {
          return;
        }

        const { data: existing } = await supabase
          .from('group_memberships')
          .select('id')
          .eq('group_id', groupId)
          .eq('patient_id', userId)
          .eq('status', 'active')
          .maybeSingle();

        if (existing) {
          return;
        }

        await supabase.from('group_memberships').insert({
          group_id: groupId,
          patient_id: userId,
          role: 'member',
          status: 'active',
        });
      } catch (err) {
        logger.error('Error auto-joining group:', err);
      }
    },
    [supabase],
  );

  return { autoJoin };
}
