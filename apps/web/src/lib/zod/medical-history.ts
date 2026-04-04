import { z } from 'zod'

export const AddAllergySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  severity: z.string().max(50).optional(),
  reaction: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
})

export const AddConditionSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  status: z.string().max(50).optional(),
  diagnosed_date: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

export const AddMedicationSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  dosage: z.string().max(200).optional(),
  frequency: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
})
