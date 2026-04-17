/**
 * Supabase adapter implementing IDoctorRepository (write-side).
 *
 * This adapter wires the canonical port in @autamedica/types to a real
 * Supabase admin client. It is the single place that knows about the
 * profiles table column names and the auth.admin.updateUserById contract.
 *
 * Only write methods required by use cases are implemented today. Read
 * methods remain on the browser-first adapter in `lib/repos/doctors.ts`
 * until those use cases are migrated in subsequent G2 controllers.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  DoctorWithProfile,
  IDoctorRepository,
  MarkOnboardingCompleteInput,
} from '@autamedica/types'
import { logger } from '@autamedica/shared'

type AdminClient = SupabaseClient<Database>

const NOT_IMPLEMENTED = (method: string): never => {
  throw new Error(`[SupabaseDoctorsRepo] ${method} not implemented in write adapter`)
}

export function createSupabaseDoctorsRepo(admin: AdminClient): IDoctorRepository {
  return {
    findAll(): Promise<DoctorWithProfile[]> {
      return Promise.resolve(NOT_IMPLEMENTED('findAll'))
    },
    findByUserId(): Promise<DoctorWithProfile | null> {
      return Promise.resolve(NOT_IMPLEMENTED('findByUserId'))
    },
    findById(): Promise<DoctorWithProfile | null> {
      return Promise.resolve(NOT_IMPLEMENTED('findById'))
    },
    findBySpecialty(): Promise<DoctorWithProfile[]> {
      return Promise.resolve(NOT_IMPLEMENTED('findBySpecialty'))
    },
    resolveIdByUserId(): Promise<string | null> {
      return Promise.resolve(NOT_IMPLEMENTED('resolveIdByUserId'))
    },

    async markOnboardingComplete(input: MarkOnboardingCompleteInput): Promise<void> {
      const patch: Record<string, unknown> = {
        onboarding_completed_at: input.completedAt,
        onboarding_started_at: input.completedAt,
      }
      if (input.firstName) patch.first_name = input.firstName
      if (input.lastName) patch.last_name = input.lastName

      const { error } = await admin
        .from('profiles')
        .update(patch)
        .eq('user_id', input.userId)

      if (error) {
        logger.error('[SupabaseDoctorsRepo] markOnboardingComplete failed', error)
        throw error
      }
    },

    async markUserMetadataOnboardingComplete(userId: string): Promise<void> {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { onboarding_completed: true },
      })

      if (error) {
        logger.error(
          '[SupabaseDoctorsRepo] markUserMetadataOnboardingComplete failed',
          error,
        )
        throw error
      }
    },
  }
}
