import { z } from 'zod'

const RatingSchema = z.number().int().min(1).max(5)

export const CreateReviewSchema = z.object({
  appointment_id: z.string().min(1, 'appointment_id is required'),
  overall_rating: RatingSchema,
  punctuality_rating: RatingSchema.nullable().optional(),
  communication_rating: RatingSchema.nullable().optional(),
  professionalism_rating: RatingSchema.nullable().optional(),
  clinical_quality_rating: RatingSchema.nullable().optional(),
  comment: z.string().max(1000, 'Comment must be 1000 characters or less').optional(),
  is_anonymous: z.boolean().default(false),
})
