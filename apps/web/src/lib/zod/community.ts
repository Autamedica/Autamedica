import { z } from 'zod'

export const CreatePostSchema = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  title: z.string().max(200).optional(),
  content: z.string().min(1, 'content is required').max(5000),
  anonymous: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
})

export const CreateCommentSchema = z.object({
  content: z.string().min(1, 'content is required').max(2000),
  anonymous: z.boolean().optional(),
})

export const DoctorCommentSchema = z.object({
  content: z.string().min(1, 'content is required').max(2000),
})

export const ReactionSchema = z.object({
  reactionType: z.string().min(1).max(50).default('like'),
})

export const CommentReactionSchema = z.object({
  reactionType: z.string().min(1).max(50).default('helpful'),
})
