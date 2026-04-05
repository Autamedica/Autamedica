/**
 * Repository: doctor profile upsert and availability management.
 * Handles all DB writes for the doctor onboarding/profile endpoint.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type AdminClient = SupabaseClient<Database>
type AvailabilityInsert = Database['public']['Tables']['doctor_availability']['Insert']
type DoctorInsert = Database['public']['Tables']['doctors']['Insert']

export const doctorProfileRepo = {
  async upsertDoctor(admin: AdminClient, data: DoctorInsert): Promise<{ id: string }> {
    const { data: result, error } = await admin
      .from('doctors')
      .upsert(data, { onConflict: 'user_id' })
      .select('id')
      .single()

    if (error) {
      logger.error('[doctorProfileRepo] upsert failed', error)
      throw error
    }

    return result as { id: string }
  },

  async updateProfileName(
    admin: AdminClient,
    userId: string,
    firstName: string | null,
    lastName: string | null,
  ): Promise<void> {
    await admin.from('profiles').update({ first_name: firstName, last_name: lastName }).eq('user_id', userId)
  },

  async replaceAvailability(
    admin: AdminClient,
    doctorId: string,
    rows: AvailabilityInsert[],
  ): Promise<void> {
    await admin.from('doctor_availability').delete().eq('doctor_id', doctorId)
    const { error } = await admin.from('doctor_availability').insert(rows)
    if (error) {
      logger.error('[doctorProfileRepo] availability insert failed', error)
    }
  },

  async countActiveAvailability(admin: AdminClient, doctorId: string): Promise<number> {
    const { count, error } = await admin
      .from('doctor_availability')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('is_active', true)

    if (error) {
      logger.error('[doctorProfileRepo] availability count failed', error)
      return 0
    }

    return count ?? 0
  },

  async insertDefaultAvailability(
    admin: AdminClient,
    rows: AvailabilityInsert[],
  ): Promise<void> {
    const { error } = await admin.from('doctor_availability').insert(rows)
    if (error) {
      logger.error('[doctorProfileRepo] default availability insert failed', error)
    }
  },
}

export type { AvailabilityInsert, DoctorInsert, AdminClient, Json }
