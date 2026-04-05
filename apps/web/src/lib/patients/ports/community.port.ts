import type {
  CommunityComment,
  CommunityGroup,
  CommunityMembership,
  CommunityPost,
  CommunitySortBy,
} from '@/lib/patients/types/community'

export interface ICommunityRepository {
  listGroups(): Promise<CommunityGroup[]>
  listMemberships(actorIds: string[]): Promise<CommunityMembership[]>
  listPosts(options: {
    limit: number
    sortBy: CommunitySortBy
    groupId?: string
  }): Promise<CommunityPost[]>
  findGroupById(groupId: string): Promise<CommunityGroup | null>
  listCommentsByPostId(postId: string): Promise<CommunityComment[]>
  findPostById(postId: string): Promise<CommunityPost | null>
  ensureMembership(
    actorIds: string[],
    groupId: string,
    primaryActorId: string,
  ): Promise<void>
  createPost(payload: {
    groupId: string
    authorId: string
    authorDisplayName: string | null
    title?: string
    content: string
    anonymous: boolean
    tags: string[]
  }): Promise<CommunityPost>
  upsertReaction(payload: {
    postId: string
    actorId: string
    reactionType: string
  }): Promise<void>
  listRecentCommentsOnPatientPosts(
    patientId: string,
    limit: number,
  ): Promise<CommunityComment[]>
  createComment(payload: {
    postId: string
    authorId?: string
    doctorAuthorId?: string
    authorDisplayName: string | null
    authorRole: 'patient' | 'doctor'
    doctorSpecialtySnapshot?: string | null
    content: string
    anonymous: boolean
  }): Promise<CommunityComment>
  findCommentById(commentId: string): Promise<CommunityComment | null>
  upsertCommentReaction(payload: {
    commentId: string
    actorId: string
    reactionType: string
  }): Promise<void>
  updatePost(
    postId: string,
    payload: {
      title?: string
      content?: string
      tags?: string[]
    },
  ): Promise<CommunityPost>
  deletePost(postId: string): Promise<void>
  resolveDisplayName(userId: string): Promise<string | null>
  findDoctorSpecialty(doctorId: string): Promise<string | null>
}
