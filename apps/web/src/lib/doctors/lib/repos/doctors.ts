/**
 * Repository: doctors table access.
 * Single source of truth for all DB queries related to doctor profiles.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import type {
  Database,
  IDoctorRepository,
  MarkOnboardingCompleteInput,
} from '@autamedica/types'
import { toCamel, logger } from '@autamedica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DoctorWithProfile } from '@autamedica/types'

type DoctorsClient = SupabaseClient<Database>

const DOCTOR_WITH_PROFILE_SELECT = `
  id,
  user_id,
  specialty,
  subspecialty,
  license_number,
  years_experience,
  consultation_fee,
  refeps_id,
  enrollment_entity,
  enrollment_jurisdiction,
  professional_address,
  payout_cbu,
  payout_alias,
  signature_image_url,
  stamp_image_url,
  signature_url,
  stamp_url,
  bio,
  languages,
  active,
  created_at,
  updated_at,
  profile:profiles!inner(
    user_id,
    first_name,
    last_name,
    email,
    phone,
    avatar_url,
    role
  )
`

export const doctorsRepo = {
  async findAll(client: DoctorsClient = getBrowserSupabaseClient()): Promise<DoctorWithProfile[]> {
    const { data, error } = await client
      .from('doctors')
      .select(DOCTOR_WITH_PROFILE_SELECT)
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[doctorsRepo] findAll failed', error)
      throw error
    }

    return toCamel<DoctorWithProfile[]>(data ?? [])
  },

  async findByUserId(
    userId: string,
    client: DoctorsClient = getBrowserSupabaseClient(),
  ): Promise<DoctorWithProfile | null> {
    const { data, error } = await client
      .from('doctors')
      .select(DOCTOR_WITH_PROFILE_SELECT)
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      logger.error('[doctorsRepo] findByUserId failed', error)
      throw error
    }

    return data ? toCamel<DoctorWithProfile>(data) : null
  },

  async findById(
    id: string,
    client: DoctorsClient = getBrowserSupabaseClient(),
  ): Promise<DoctorWithProfile | null> {
    const { data, error } = await client
      .from('doctors')
      .select(DOCTOR_WITH_PROFILE_SELECT)
      .eq('id', id)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      logger.error('[doctorsRepo] findById failed', error)
      throw error
    }

    return data ? toCamel<DoctorWithProfile>(data) : null
  },

  async findBySpecialty(
    specialty: string,
    client: DoctorsClient = getBrowserSupabaseClient(),
  ): Promise<DoctorWithProfile[]> {
    const { data, error } = await client
      .from('doctors')
      .select(DOCTOR_WITH_PROFILE_SELECT)
      .eq('specialty', specialty)
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[doctorsRepo] findBySpecialty failed', error)
      throw error
    }

    return toCamel<DoctorWithProfile[]>(data ?? [])
  },

  async resolveIdByUserId(
    userId: string,
    client: DoctorsClient = getBrowserSupabaseClient(),
  ): Promise<string | null> {
    const { data, error } = await client
      .from('doctors')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.warn('[doctorsRepo] resolveIdByUserId failed', error)
      return null
    }

    return data?.id ?? null
  },

  async markOnboardingComplete(
    input: MarkOnboardingCompleteInput,
    client: DoctorsClient = getBrowserSupabaseClient(),
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      onboarding_completed_at: input.completedAt,
      onboarding_started_at: input.completedAt,
    }
    if (input.firstName) patch.first_name = input.firstName
    if (input.lastName) patch.last_name = input.lastName

    const { error } = await client
      .from('profiles')
      .update(patch)
      .eq('user_id', input.userId)

    if (error) {
      logger.error('[doctorsRepo] markOnboardingComplete failed', error)
      throw error
    }
  },

  async markUserMetadataOnboardingComplete(_userId: string): Promise<void> {
    // Browser adapter cannot call admin.updateUserById; use the server-side
    // Supabase admin adapter (see apps/web/src/lib/doctors/adapters/supabase-doctors.repo.ts).
    throw new Error('[doctorsRepo] markUserMetadataOnboardingComplete requires admin client')
  },
}

/**
 * Factory: crea un adapter que implementa IDoctorRepository
 * cerrando sobre un SupabaseClient específico.
 * Útil para use cases con inversión de dependencias y testing.
 */
export function createDoctorRepositoryAdapter(
  client: DoctorsClient = getBrowserSupabaseClient(),
): IDoctorRepository {
  return {
    findAll: () => doctorsRepo.findAll(client),
    findByUserId: (userId) => doctorsRepo.findByUserId(userId, client),
    findById: (id) => doctorsRepo.findById(id, client),
    findBySpecialty: (specialty) => doctorsRepo.findBySpecialty(specialty, client),
    resolveIdByUserId: (userId) => doctorsRepo.resolveIdByUserId(userId, client),
    markOnboardingComplete: (input) => doctorsRepo.markOnboardingComplete(input, client),
    markUserMetadataOnboardingComplete: (userId) =>
      doctorsRepo.markUserMetadataOnboardingComplete(userId),
  }
}
