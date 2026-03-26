/**
 * Repository: doctors table access.
 * Single source of truth for all DB queries related to doctor profiles.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import type { Database } from '@autamedica/types'
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
}
