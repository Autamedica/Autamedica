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
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type ProfileIdentityUpdate = Partial<Pick<ProfileUpdate, 'first_name' | 'last_name' | 'phone'>>

function compactPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

export const doctorProfileRepo = {
  async findExistingDoctorStatus(
    admin: AdminClient,
    userId: string,
  ): Promise<{ id: string; active: boolean | null } | null> {
    const { data, error } = await admin
      .from('doctors')
      .select('id, active')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.error('[doctorProfileRepo] findExistingDoctorStatus failed', error)
      throw error
    }

    return data as { id: string; active: boolean | null } | null
  },

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

  async updateProfileIdentity(
    admin: AdminClient,
    userId: string,
    patch: ProfileIdentityUpdate,
  ): Promise<void> {
    const profilePatch = compactPatch(patch)
    if (Object.keys(profilePatch).length === 0) return

    const { error } = await admin
      .from('profiles')
      .update(profilePatch)
      .eq('user_id', userId)

    if (error) {
      logger.error('[doctorProfileRepo] profile identity update failed', error)
      throw error
    }
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

  async ensurePendingLicense(
    admin: AdminClient,
    input: {
      doctorId: string
      licenseNumber: string
      licenseType: string
      province?: string | null
      ufBrazil?: string | null
    },
  ): Promise<void> {
    const { data: existing, error: lookupError } = await admin
      .from('doctor_licenses')
      .select('id')
      .eq('doctor_id', input.doctorId)
      .eq('license_number', input.licenseNumber)
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      logger.error('[doctorProfileRepo] license lookup failed', lookupError)
      throw lookupError
    }

    if (existing) return

    const { error: insertError } = await admin.from('doctor_licenses').insert({
      doctor_id: input.doctorId,
      license_number: input.licenseNumber,
      license_type: input.licenseType,
      province: input.province ?? null,
      uf_brazil: input.ufBrazil ?? null,
      status: 'inactive',
      cfm_validation_status: input.licenseType === 'CRM' ? 'pending' : null,
    })

    if (insertError) {
      logger.error('[doctorProfileRepo] pending license insert failed', insertError)
      throw insertError
    }
  },

  async markArValidationPendingReview(admin: AdminClient, userId: string): Promise<void> {
    const { data: profile, error: lookupError } = await admin
      .from('profiles')
      .select('sss_validation_status')
      .eq('user_id', userId)
      .maybeSingle()

    if (lookupError) {
      logger.error('[doctorProfileRepo] AR validation lookup failed', lookupError)
      throw lookupError
    }

    if (profile && profile.sss_validation_status !== null && profile.sss_validation_status !== 'pending') {
      return
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({ sss_validation_status: 'pending_review' })
      .eq('user_id', userId)

    if (updateError) {
      logger.error('[doctorProfileRepo] markArValidationPendingReview failed', updateError)
      throw updateError
    }
  },
}

export type { AvailabilityInsert, DoctorInsert, AdminClient, Json }
