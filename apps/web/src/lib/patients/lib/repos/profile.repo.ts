/**
 * Repository: profiles + patients tables access for patient-scoped routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>
type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type PatientInsert = Database['public']['Tables']['patients']['Insert']
type PatientUpdate = Database['public']['Tables']['patients']['Update']

export const profileRepo = {
  async upsertProfile(
    supabase: Db,
    userId: string,
    payload: Partial<ProfileUpdate>,
  ): Promise<unknown> {
    const upd = await supabase
      .from('profiles')
      .update(payload as unknown as ProfileUpdate)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle()

    if (upd.error && upd.error.code !== 'PGRST116') throw upd.error

    if (upd.data) return upd.data

    const ins = await supabase
      .from('profiles')
      .insert({
        user_id: userId,
        external_id: userId,
        role: 'patient',
        ...payload,
      } as unknown as ProfileInsert)
      .select('*')
      .single()

    if (ins.error) throw ins.error
    return ins.data
  },

  async upsertPatient(
    supabase: Db,
    userId: string,
    payload: Partial<PatientUpdate>,
  ): Promise<unknown> {
    const upd = await supabase
      .from('patients')
      .update(payload as unknown as PatientUpdate)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle()

    if (upd.error) throw upd.error

    if (upd.data) return upd.data

    const ins = await supabase
      .from('patients')
      .upsert(
        { user_id: userId, ...payload } as unknown as PatientInsert,
        { onConflict: 'user_id' },
      )
      .select('*')
      .maybeSingle()

    if (ins.error) throw ins.error
    return ins.data
  },

  async ensureBoth(
    supabase: Db,
    userId: string,
    email?: string | null,
  ): Promise<void> {
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          email: typeof email === 'string' && email.length > 0 ? email : null,
          external_id: userId,
          role: 'patient',
        } as unknown as ProfileInsert,
        { onConflict: 'user_id' },
      )
      .select()
      .single()

    if (profileErr) {
      logger.error('[profileRepo] ensureBoth profiles failed', profileErr)
      throw profileErr
    }

    try {
      await supabase
        .from('patients')
        .upsert(
          { user_id: userId, active: true } as unknown as PatientInsert,
          { onConflict: 'user_id' },
        )
        .select()
        .single()
    } catch (err) {
      // Non-fatal: patient row may already exist with different constraints
      logger.warn('[profileRepo] ensureBoth patients upsert skipped', err)
    }
  },

  async updateOnboardingComplete(
    supabase: Db,
    userId: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('profiles')
      .update({
        onboarding_completed_at: now,
        onboarding_started_at: now,
      })
      .eq('user_id', userId)

    if (error) {
      logger.error('[profileRepo] updateOnboardingComplete failed', error)
      throw error
    }
  },
}
