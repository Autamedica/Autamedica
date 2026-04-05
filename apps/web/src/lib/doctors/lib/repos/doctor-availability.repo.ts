/**
 * Repository: doctor availability CRUD.
 * Manages weekly recurring availability and date-specific overrides.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type AdminClient = SupabaseClient<Database>
type AvailabilityRow = Database['public']['Tables']['doctor_availability']['Row']
type AvailabilityInsert = Database['public']['Tables']['doctor_availability']['Insert']
type OverrideRow = Database['public']['Tables']['doctor_availability_overrides']['Row']
type OverrideInsert = Database['public']['Tables']['doctor_availability_overrides']['Insert']

export const doctorAvailabilityRepo = {
  async listWeekly(admin: AdminClient, doctorId: string): Promise<AvailabilityRow[]> {
    const { data, error } = await admin
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('is_active', true)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      logger.error('[doctorAvailabilityRepo] listWeekly failed', error)
      throw error
    }
    return data ?? []
  },

  async replaceWeekly(
    admin: AdminClient,
    doctorId: string,
    rows: Omit<AvailabilityInsert, 'doctor_id'>[],
  ): Promise<AvailabilityRow[]> {
    await admin.from('doctor_availability').delete().eq('doctor_id', doctorId)

    const insertRows = rows.map((r) => ({ ...r, doctor_id: doctorId }))
    const { data, error } = await admin
      .from('doctor_availability')
      .insert(insertRows)
      .select('*')

    if (error) {
      logger.error('[doctorAvailabilityRepo] replaceWeekly insert failed', error)
      throw error
    }
    return data ?? []
  },

  async listOverrides(admin: AdminClient, doctorId: string): Promise<OverrideRow[]> {
    const { data, error } = await admin
      .from('doctor_availability_overrides')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('override_date', { ascending: true })

    if (error) {
      logger.error('[doctorAvailabilityRepo] listOverrides failed', error)
      throw error
    }
    return data ?? []
  },

  async insertOverride(
    admin: AdminClient,
    doctorId: string,
    data: Omit<OverrideInsert, 'doctor_id'>,
  ): Promise<OverrideRow> {
    const { data: created, error } = await admin
      .from('doctor_availability_overrides')
      .insert({ ...data, doctor_id: doctorId })
      .select('*')
      .single()

    if (error) {
      logger.error('[doctorAvailabilityRepo] insertOverride failed', error)
      throw error
    }
    return created
  },

  async deleteOverride(
    admin: AdminClient,
    doctorId: string,
    overrideId: string,
  ): Promise<boolean> {
    const { data, error } = await admin
      .from('doctor_availability_overrides')
      .delete()
      .eq('id', overrideId)
      .eq('doctor_id', doctorId)
      .select('id')

    if (error) {
      logger.error('[doctorAvailabilityRepo] deleteOverride failed', error)
      throw error
    }
    return (data?.length ?? 0) > 0
  },
}

export type { AvailabilityRow, AvailabilityInsert, OverrideRow, OverrideInsert }
