import { fetchApi } from '@/lib/api-client';
import type {
  AddCommunityReactionInput,
  CommunityComment,
  CommunityPost,
  CommunityOverview,
  CommunitySortBy,
  CreateCommunityCommentInput,
  CreateCommunityPostInput,
} from '@/lib/patients/types/community';

function buildOverviewUrl(options?: {
  limit?: number;
  sortBy?: CommunitySortBy;
  groupId?: string;
}): string {
  const search = new URLSearchParams();

  if (typeof options?.limit === 'number') {
    search.set('limit', String(options.limit));
  }

  if (options?.sortBy) {
    search.set('sort_by', options.sortBy);
  }

  if (options?.groupId) {
    search.set('group_id', options.groupId);
  }

  const query = search.toString();
  return query.length > 0 ? `/api/patients/community?${query}` : '/api/patients/community';
}

export const communityBrowserService = {
  async getOverview(options?: {
    limit?: number;
    sortBy?: CommunitySortBy;
    groupId?: string;
  }): Promise<CommunityOverview> {
    return fetchApi<CommunityOverview>(buildOverviewUrl(options));
  },

  async createPost(payload: CreateCommunityPostInput) {
    return fetchApi<CommunityPost>('/api/patients/community/posts', {
      body: payload,
    });
  },

  async addReaction(payload: AddCommunityReactionInput) {
    return fetchApi<{ success: true }>(`/api/patients/community/posts/${payload.postId}/reactions`, {
      body: { reactionType: payload.reactionType },
    });
  },

  async getComments(postId: string): Promise<CommunityComment[]> {
    return fetchApi<CommunityComment[]>(`/api/patients/community/posts/${postId}/comments`);
  },

  async createComment(payload: CreateCommunityCommentInput): Promise<CommunityComment> {
    return fetchApi<CommunityComment>(`/api/patients/community/posts/${payload.postId}/comments`, {
      body: { content: payload.content, anonymous: payload.anonymous },
    });
  },
};
