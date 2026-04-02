import { fetchApi } from '@/lib/api-client';
import type { CommunityComment, CommunityPost } from '@/lib/patients/types/community';

interface DoctorPostsResponse {
  posts: CommunityPost[];
}

export const doctorCommunityBrowserService = {
  async getPosts(options?: { limit?: number; sortBy?: 'recent' | 'popular' }): Promise<CommunityPost[]> {
    const search = new URLSearchParams();

    if (options?.limit) {
      search.set('limit', String(options.limit));
    }

    if (options?.sortBy) {
      search.set('sort_by', options.sortBy);
    }

    const query = search.toString();
    const url = query.length > 0 ? `/api/doctors/community/posts?${query}` : '/api/doctors/community/posts';
    const result = await fetchApi<DoctorPostsResponse>(url);
    return result.posts ?? [];
  },

  async getComments(postId: string): Promise<CommunityComment[]> {
    return fetchApi<CommunityComment[]>(`/api/doctors/community/posts/${postId}/comments`);
  },

  async createComment(payload: { postId: string; content: string }): Promise<CommunityComment> {
    return fetchApi<CommunityComment>(`/api/doctors/community/posts/${payload.postId}/comments`, {
      body: { content: payload.content },
    });
  },
};
