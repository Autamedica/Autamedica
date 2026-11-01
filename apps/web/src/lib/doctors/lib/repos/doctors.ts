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
    role,
    sss_validation_status,
    sss_last_checked_at,
    especialidad_registrada,
    matricula_nacional
  )
`

const DOCTOR_WITH_PROFILE_LEGACY_SELECT = `
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

type SupabaseSelectResult<T> = {
  data: T | null
  error: {
    code?: string
    message?: string
    details?: string
    hint?: string
  } | null
}

const LICENSE_PROFILE_COLUMNS = [
  'sss_validation_status',
  'sss_last_checked_at',
  'especialidad_registrada',
  'matricula_nacional',
] as const

function isMissingLicenseProfileColumn(error: SupabaseSelectResult<unknown>['error']): boolean {
  if (!error) return false

  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase()
  return (
    error.code === '42703' ||
    LICENSE_PROFILE_COLUMNS.some((column) => text.includes(column))
  )
}

async function runDoctorProfileSelect<T>(
  scope: string,
  primary: () => PromiseLike<SupabaseSelectResult<T>>,
  legacy: () => PromiseLike<SupabaseSelectResult<T>>,
): Promise<T | null> {
  const result = await primary()

  if (!isMissingLicenseProfileColumn(result.error)) {
    if (result.error) {
      logger.error(`[doctorsRepo] ${scope} failed`, result.error)
      throw result.error
    }

    return result.data
  }

  logger.warn(
    `[doctorsRepo] ${scope} license profile columns missing; retrying legacy profile select`,
    result.error,
  )

  const fallback = await legacy()
  if (fallback.error) {
    logger.error(`[doctorsRepo] ${scope} legacy fallback failed`, fallback.error)
    throw fallback.error
  }

  return fallback.data
}

export const doctorsRepo = {
  async findAll(client: DoctorsClient = getBrowserSupabaseClient()): Promise<DoctorWithProfile[]> {
    const { data, error } = await client.rpc('get_patient_doctor_directory')
    if (error) throw error
    return toCamel<DoctorWithProfile[]>(data ?? [])
  },

  async findByUserId(
    userId: string,
    client: DoctorsClient = getBrowserSupabaseClient(),
  ): Promise<DoctorWithProfile | null> {
    const data = await runDoctorProfileSelect(
      'findByUserId',
      () => client
        .from('doctors')
        .select(DOCTOR_WITH_PROFILE_SELECT)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle(),
      () => client
        .from('doctors')
        .select(DOCTOR_WITH_PROFILE_LEGACY_SELECT)
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle(),
    )

    return data ? toCamel<DoctorWithProfile>(data) : null
  },

  async findById(
    id: string,
    client: DoctorsClient = getBrowserSupabaseClient(),
  ): Promise<DoctorWithProfile | null> {
    const data = await runDoctorProfileSelect(
      'findById',
      () => client
        .from('doctors')
        .select(DOCTOR_WITH_PROFILE_SELECT)
        .eq('id', id)
        .eq('active', true)
        .maybeSingle(),
      () => client
        .from('doctors')
        .select(DOCTOR_WITH_PROFILE_LEGACY_SELECT)
        .eq('id', id)
        .eq('active', true)
        .maybeSingle(),
    )

    return data ? toCamel<DoctorWithProfile>(data) : null
  },

  async findBySpecialty(
    specialty: string,
    client: DoctorsClient = getBrowserSupabaseClient(),
  ): Promise<DoctorWithProfile[]> {
    const rows = await doctorsRepo.findAll(client)
    return rows.filter(row => row.specialty === specialty)
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

