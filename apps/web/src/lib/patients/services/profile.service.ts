/**
 * Backend Service: patient profile business logic.
 * Orchestrates profile + patient upserts and side effects (AI context rebuild).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { profileRepo } from '@/lib/patients/lib/repos/profile.repo'
import { buildPatientContext, persistPatientContextFiles } from '@/lib/patients/lib/ai/context-builder'
import { buildPatientUpdatePayload } from '@/lib/patients/lib/zod/patients'
import { buildProfileUpdatePayload } from '@/lib/patients/lib/zod/profiles'

type Db = SupabaseClient<Database>

export interface ProfileUpdateInput {
  profile?: Record<string, unknown>
  patient?: Record<string, unknown>
}

export interface ProfileUpdateResult {
  profile: unknown
  patient: unknown
}

export const profileService = {
  async update(
    supabase: Db,
    userId: string,
    input: ProfileUpdateInput,
  ): Promise<ProfileUpdateResult> {
    let updatedProfile: unknown = null
    let updatedPatient: unknown = null

    if (input.profile) {
      const snake = buildProfileUpdatePayload(input.profile)
      try {
        updatedProfile = await profileRepo.upsertProfile(supabase, userId, snake as Record<string, unknown>)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'profile_update_failed'
        logger.error('[profileService] profile update failed', err)
        throw Object.assign(new Error(msg), { code: 'PROFILE_UPDATE_FAILED' })
      }
    }

    if (input.patient) {
      const snake = buildPatientUpdatePayload(input.patient)
      try {
        updatedPatient = await profileRepo.upsertPatient(supabase, userId, snake as Record<string, unknown>)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn('[profileService] patient update skipped:', msg)
      }
    }

    // Fire-and-forget: rebuild AI context
    buildPatientContext(userId, supabase)
      .then((ctx) => persistPatientContextFiles(userId, ctx, supabase))
      .catch((err) => logger.warn('[profileService] AI context resync failed:', err))

    return { profile: updatedProfile, patient: updatedPatient }
  },

  async ensure(
    supabase: Db,
    userId: string,
    email?: string | null,
  ): Promise<void> {
    await profileRepo.ensureBoth(supabase, userId, email)
  },

  async completeOnboarding(
    supabase: Db,
    adminSupabase: Db,
    userId: string,
  ): Promise<void> {
    await profileRepo.updateOnboardingComplete(supabase, userId)

    const { error: authError } = await (adminSupabase.auth.admin as { updateUserById: (id: string, data: unknown) => Promise<{ error: unknown }> }).updateUserById(userId, {
      user_metadata: { onboarding_completed: true },
    })

    if (authError) {
      logger.error('[profileService] onboarding user_metadata update failed', authError)
    }
  },
}
