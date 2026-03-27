export type CommunitySortBy = 'recent' | 'popular';

export interface CommunityGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  member_count: number;
  post_count: number;
  icon: string | null;
  tags: string[];
}

export interface CommunityMembership {
  id: string;
  group_id: string;
  patient_id: string;
  status: string;
  role: string | null;
  post_count: number;
  comment_count: number;
  helpful_reactions_received: number;
  last_active: string | null;
}

export interface CommunityPost {
  id: string;
  group_id: string;
  author_id: string;
  author_display_name: string | null;
  is_anonymous: boolean;
  title: string;
  content: string;
  tags: string[];
  moderation_status: string;
  reaction_count: number;
  comment_count: number;
  view_count: number;
  created_at: string;
  group?: CommunityGroup | null;
}

export interface CommunityOverview {
  viewer: {
    userId: string;
    patientId: string;
  };
  groups: CommunityGroup[];
  memberships: CommunityMembership[];
  posts: CommunityPost[];
}

export interface CreateCommunityPostInput {
  groupId: string;
  title?: string;
  content: string;
  anonymous?: boolean;
  tags?: string[];
}

export interface AddCommunityReactionInput {
  postId: string;
  reactionType: string;
}
