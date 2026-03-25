/**
 * Service: Patient session initialization.
 * Pure async functions for fetching/creating profiles and patients.
 * No React dependencies. Called from usePatientSession hook.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { Profile } from '@/lib/patients/lib/zod/profiles'
import { safeParseProfile } from '@/lib/patients/lib/zod/profiles'
import type { Patient } from '@/lib/patients/lib/zod/patients'
import { parsePatient } from '@/lib/patients/lib/zod/patients'

type Db = SupabaseClient<Database>

function ensureEmail(user: User): string {
  const candidate =
    user.email ?? (user.user_metadata as Record<string, unknown> | undefined)?.email
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate
  }
  return `${user.id}@patients.autamedica.local`
}

export const patientSessionService = {
  async fetchOrCreateProfile(supabase: Db, user: User): Promise<Profile> {
    const email = ensureEmail(user)

    // Attempt 1: new schema (user_id)
    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    // If column doesn't exist or no row, try legacy schema (id)
    if ((error && error.code !== 'PGRST116') || (!data && !error)) {
      const tryLegacy = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data = tryLegacy.data as any
      error = tryLegacy.error
    }

    if (error && error.code !== 'PGRST116') {
      logger.error('[patientSessionService] fetchOrCreateProfile select failed', error)
      throw error
    }

    let profileRow: Record<string, unknown> | null = (data as Record<string, unknown> | null) ?? null

    // Normalize id -> user_id if legacy
    if (profileRow && !profileRow['user_id'] && profileRow['id']) {
      profileRow = { ...profileRow, user_id: profileRow['id'] }
    }

    if (!profileRow) {
      // Try inserting with user_id; fallback to id schema
      let inserted: Record<string, unknown> | null = null
      let insertError: Error | null = null

      const insert = await (supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          email,
          role: 'patient',
          external_id: user.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select('*')
        .single())

      inserted = insert.data as Record<string, unknown> | null
      insertError = insert.error

      if (insertError) {
        logger.warn('[patientSessionService] insert with user_id failed, retrying legacy schema', insertError)
        // Retry legacy schema
        const legacy = await (supabase
          .from('profiles')
          .insert({
            id: user.id,
            email,
            role: 'patient',
            external_id: user.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
          .select('*')
          .single())

        inserted = legacy.data as Record<string, unknown> | null
        insertError = legacy.error
      }

      if (insertError) {
        throw insertError
      }

      profileRow = inserted
    } else {
      const updates: Record<string, unknown> = {}

      if (!profileRow.email) {
        updates.email = email
      }

      if (Object.keys(updates).length > 0) {
        const updateTry = await (supabase
          .from('profiles')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(updates as any)
          .eq(profileRow['user_id'] ? 'user_id' : 'id', user.id)
          .select('*')
          .single())

        const updated = updateTry.data as Record<string, unknown> | null
        const updateError = updateTry.error

        if (updateError) {
          throw updateError
        }

        profileRow = updated
      }
    }

    if (!profileRow) {
      throw new Error('Could not retrieve or create profile')
    }

    // Robust parse: try zod; fallback to normalized object
    const parsed = safeParseProfile(profileRow)
    if (parsed) return parsed

    return {
      userId: (profileRow['user_id'] ?? profileRow['id']) as string,
      email: (profileRow['email'] ?? email) as string,
      role: (typeof profileRow['role'] === 'string' ? profileRow['role'] : 'patient') as
        | 'patient'
        | 'admin',
      firstName:
        typeof profileRow['first_name'] === 'string' ? profileRow['first_name'] : null,
      lastName:
        typeof profileRow['last_name'] === 'string' ? profileRow['last_name'] : null,
      phone: typeof profileRow['phone'] === 'string' ? profileRow['phone'] : null,
      avatarUrl:
        typeof profileRow['avatar_url'] === 'string' ? profileRow['avatar_url'] : null,
      active: typeof profileRow['active'] === 'boolean' ? profileRow['active'] : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as unknown as Profile
  },

  async fetchOrCreatePatient(supabase: Db, userId: string): Promise<Patient | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    let patientRow = data ?? null

    if (!patientRow) {
      const { data: inserted, error: insertError } = await (supabase
        .from('patients')
        .insert({
          user_id: userId,
          active: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select('*'))

      if (insertError) {
        throw insertError
      }

      if (Array.isArray(inserted) && inserted.length > 0) {
        patientRow = inserted[0]
      } else if (inserted && !Array.isArray(inserted)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patientRow = inserted as any
      }
    }

    return patientRow ? parsePatient(patientRow) : null
  },
}
