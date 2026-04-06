/**
 * Service: Reproductive Health specialists.
 * Thin orchestration layer transforming raw DB rows to typed results.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  ReproductiveHealthSpecialistWithProfile,
  ReproductiveHealthSpecialtyType,
  SpecialistAvailabilityStatus,
} from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { reproductiveHealthRepo } from '@/lib/patients/lib/repos/reproductive-health.repo'

type AdminClient = SupabaseClient<Database>

interface SpecialistFilters {
  specialty?: ReproductiveHealthSpecialtyType
  availableOnly?: boolean
  certifiedIveIle?: boolean
}

interface RawSpecialistRow {
  id: string
  doctor_id: string
  specialty: string
  is_certified_ive_ile: boolean
  availability_status: string
  accepts_emergency_consultations: boolean
  rating: number
  total_consultations: number
  years_of_experience: number
  languages: string[]
  bio: string
  created_at: string
  updated_at: string
  doctor: {
    id: string
    first_name: string
    last_name: string
    email: string
    phone: string | null
    profile_image_url: string | null
  } | null
}

function toSpecialistWithProfile(
  row: RawSpecialistRow,
): ReproductiveHealthSpecialistWithProfile {
  const doctor = row.doctor
  return {
    id: row.id,
    doctor_id: row.doctor_id,
    specialty: row.specialty,
    is_certified_ive_ile: row.is_certified_ive_ile,
    availability_status: row.availability_status,
    accepts_emergency_consultations: row.accepts_emergency_consultations,
    rating: row.rating,
    total_consultations: row.total_consultations,
    years_of_experience: row.years_of_experience,
    languages: row.languages,
    bio: row.bio,
    created_at: row.created_at,
    updated_at: row.updated_at,
    first_name: doctor?.first_name ?? '',
    last_name: doctor?.last_name ?? '',
    email: doctor?.email ?? '',
    phone: doctor?.phone ?? undefined,
    profile_image_url: doctor?.profile_image_url ?? undefined,
  } as ReproductiveHealthSpecialistWithProfile
}

export const reproductiveHealthService = {
  async listSpecialists(
    admin: AdminClient,
    filters?: SpecialistFilters,
  ): Promise<ReproductiveHealthSpecialistWithProfile[]> {
    const rows = await reproductiveHealthRepo.listSpecialists(admin, filters)
    return (rows as unknown as RawSpecialistRow[]).map(toSpecialistWithProfile)
  },

  async getSpecialistById(
    admin: AdminClient,
    id: string,
  ): Promise<ReproductiveHealthSpecialistWithProfile> {
    const row = await reproductiveHealthRepo.findSpecialistById(admin, id)
    return toSpecialistWithProfile(row as unknown as RawSpecialistRow)
  },

  async updateAvailability(
    admin: AdminClient,
    id: string,
    status: SpecialistAvailabilityStatus,
  ) {
    logger.info(`[reproductiveHealthService] updating availability for specialist=${id} to ${status}`)
    return reproductiveHealthRepo.updateAvailability(admin, id, status)
  },
}
