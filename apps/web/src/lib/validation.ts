import type { ZodSchema, ZodError } from 'zod'
import { badRequest } from '@/lib/api-helpers'

interface ValidationSuccess<T> {
  success: true
  data: T
}

interface ValidationFailure {
  success: false
  error: Response
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

/**
 * Validate an unknown body against a Zod schema.
 * Returns either typed data or a pre-built 400 Response.
 */
export function validateBody<T>(schema: ZodSchema<T>, body: unknown): ValidationResult<T> {
  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      success: false,
      error: badRequest(formatZodError(result.error)),
    }
  }
  return { success: true, data: result.data }
}

function formatZodError(error: ZodError): string {
  const first = error.issues[0]
  if (!first) return 'invalid_input'

  if (first.path.length > 0) {
    return `${first.path.join('.')}: ${first.message}`
  }
  return first.message
}
