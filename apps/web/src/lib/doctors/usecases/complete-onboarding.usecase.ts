/**
 * Use case: complete doctor onboarding.
 *
 * Writes are delegated to an IDoctorRepository implementation so the handler
 * stays thin and the flow is unit-testable without a Supabase client.
 *
 * Auth and HTTP concerns live in the controller — this function only accepts
 * a validated payload and a verified user id.
 */
import { logger } from '@autamedica/shared'
import type { IDoctorRepository } from '@autamedica/types'

export interface CompleteOnboardingDeps {
  doctorsRepo: IDoctorRepository
}

export interface CompleteOnboardingArgs {
  userId: string
  firstName?: string | null
  lastName?: string | null
}

export type CompleteOnboardingOutcome =
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

export async function completeOnboardingUseCase(
  deps: CompleteOnboardingDeps,
  args: CompleteOnboardingArgs,
): Promise<CompleteOnboardingOutcome> {
  if (!args.userId?.trim()) {
    return { kind: 'error', message: 'userId_required' }
  }

  const completedAt = new Date().toISOString()

  try {
    await deps.doctorsRepo.markOnboardingComplete({
      userId: args.userId,
      firstName: args.firstName ?? null,
      lastName: args.lastName ?? null,
      completedAt,
    })
  } catch (err) {
    logger.error('[completeOnboardingUseCase] profile update failed', err)
    return { kind: 'error', message: 'profile_update_failed' }
  }

  try {
    await deps.doctorsRepo.markUserMetadataOnboardingComplete(args.userId)
  } catch (err) {
    // Metadata failure is non-fatal for the business flow: the profile is
    // already marked complete. We log and keep the OK outcome so the client
    // can proceed; a follow-up sync will reconcile metadata on next login.
    logger.error('[completeOnboardingUseCase] user metadata update failed', err)
  }

  return { kind: 'ok' }
}
