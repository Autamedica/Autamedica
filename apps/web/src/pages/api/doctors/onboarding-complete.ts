/**
 * POST /api/doctors/onboarding-complete
 *
 * Thin controller: auth + zod validation + delegation to the use case.
 * All writes live in `completeOnboardingUseCase` and `SupabaseDoctorsRepo`.
 */
import type { APIRoute } from 'astro'
import { z } from 'zod'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { jsonOk, internalError } from '@/lib/api-helpers'
import { validateBody } from '@/lib/validation'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { createSupabaseDoctorsRepo } from '@/lib/doctors/adapters/supabase-doctors.repo'
import { completeOnboardingUseCase } from '@/lib/doctors/usecases/complete-onboarding.usecase'

const OnboardingCompleteSchema = z.object({
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().min(1).optional(),
})

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES)
    if (!isAuthed(auth)) return auth

    const raw = (await request.json().catch(() => ({}))) as unknown
    const validated = validateBody(OnboardingCompleteSchema, raw)
    if (validated.success === false) return validated.error

    const doctorsRepo = createSupabaseDoctorsRepo(createAstroAdminClient(locals.runtime?.env))

    const outcome = await completeOnboardingUseCase(
      { doctorsRepo },
      {
        userId: auth.user.id,
        firstName: validated.data.first_name ?? null,
        lastName: validated.data.last_name ?? null,
      },
    )

    if (outcome.kind === 'error') {
      logger.error('[API] doctor onboarding-complete failed', { message: outcome.message })
      return internalError(outcome.message)
    }

    return jsonOk(null)
  } catch (err) {
    logger.error('[API] doctor onboarding-complete error', err as Error)
    return internalError()
  }
}
