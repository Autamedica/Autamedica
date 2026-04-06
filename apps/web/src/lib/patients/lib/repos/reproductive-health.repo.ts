/**
 * Repository: reproductive health specialists CRUD.
 * Manages reproductive_health_specialists with doctor profile joins.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type {
  ReproductiveHealthSpecialtyType,
  SpecialistAvailabilityStatus,
} from '@autamedica/types'
import { logger } from '@autamedica/shared'

type AdminClient = SupabaseClient<Database>

const SPECIALIST_SELECT = '*, doctor:doctors(id, first_name, last_name, email, phone, profile_image_url)' as const

interface SpecialistFilters {
  specialty?: ReproductiveHealthSpecialtyType
  availableOnly?: boolean
  certifiedIveIle?: boolean
}

export const reproductiveHealthRepo = {
  async listSpecialists(admin: AdminClient, filters?: SpecialistFilters) {
    let query = admin
      .from('reproductive_health_specialists')
      .select(SPECIALIST_SELECT)

    if (filters?.specialty) {
      query = query.eq('specialty', filters.specialty)
    }
    if (filters?.availableOnly) {
      query = query.eq('availability_status', 'available')
    }
    if (filters?.certifiedIveIle) {
      query = query.eq('is_certified_ive_ile', true)
    }

    const { data, error } = await query
      .order('rating', { ascending: false })
      .order('total_consultations', { ascending: false })

    if (error) {
      logger.error('[reproductiveHealthRepo] listSpecialists failed', error)
      throw error
    }
    return data ?? []
  },

  async findSpecialistById(admin: AdminClient, id: string) {
    const { data, error } = await admin
      .from('reproductive_health_specialists')
      .select(SPECIALIST_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      logger.error('[reproductiveHealthRepo] findSpecialistById failed', error)
      throw error
    }
    return data
  },

  async updateAvailability(
    admin: AdminClient,
    id: string,
    status: SpecialistAvailabilityStatus,
  ) {
    const { data, error } = await admin
      .from('reproductive_health_specialists')
      .update({ availability_status: status } as never)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      logger.error('[reproductiveHealthRepo] updateAvailability failed', error)
      throw error
    }
    return data
  },
}
