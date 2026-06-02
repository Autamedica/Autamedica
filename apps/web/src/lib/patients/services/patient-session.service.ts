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

/** In-memory cache to deduplicate concurrent fetches across React islands */
const CACHE_TTL_MS = 10_000 // 10 seconds

const profileCache = new Map<string, { data: Profile; ts: number }>()
const patientCache = new Map<string, { data: Patient | null; ts: number }>()
const inflightProfiles = new Map<string, Promise<Profile>>()
const inflightPatients = new Map<string, Promise<Patient | null>>()

type DbRow = Record<string, unknown>

interface DbError extends Error {
  code?: string
}

interface DbResult<T> {
  data: T | null
  error: DbError | null
}

interface DbQueryBuilder
  extends PromiseLike<{ data: DbRow | DbRow[] | null; error: DbError | null }> {
  select(columns: string): DbQueryBuilder
  eq(column: string, value: string): DbQueryBuilder
  insert(values: DbRow): DbQueryBuilder
  update(values: DbRow): DbQueryBuilder
  single(): Promise<DbResult<DbRow>>
  maybeSingle(): Promise<DbResult<DbRow>>
}

interface LooseDb {
  from(relation: string): DbQueryBuilder
}

type Db = SupabaseClient<Database>

function ensureEmail(user: User): string {
  const candidate =
    user.email ?? (user.user_metadata as Record<string, unknown> | undefined)?.email
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate
  }
  return `${user.id}@patients.autamedica.local`
}

async function fetchOrCreateProfileImpl(supabase: Db, user: User): Promise<Profile> {
  const db = supabase as unknown as LooseDb
  const email = ensureEmail(user)

  // Attempt 1: new schema (user_id)
  let { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  // If column doesn't exist or no row, try legacy schema (id)
  if ((error && error.code !== 'PGRST116') || (!data && !error)) {
    const tryLegacy = await db
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    data = tryLegacy.data as DbRow | null
    error = tryLegacy.error
  }

  if (error && error.code !== 'PGRST116') {
    logger.error('[patientSessionService] fetchOrCreateProfile select failed', error)
    throw error
  }

  let profileRow: DbRow | null = (data as DbRow | null) ?? null

  // Normalize id -> user_id if legacy
  if (profileRow && !profileRow['user_id'] && profileRow['id']) {
    profileRow = { ...profileRow, user_id: profileRow['id'] }
  }

  if (!profileRow) {
    // Try inserting with user_id; fallback to id schema
    let inserted: DbRow | null = null
    let insertError: Error | null = null

    const insert = await (db
      .from('profiles')
      .insert({
        user_id: user.id,
        email,
        role: 'patient',
        external_id: user.id,
      } satisfies DbRow)
      .select('*')
      .single())

    inserted = insert.data as DbRow | null
    insertError = insert.error

    if (insertError) {
      logger.warn('[patientSessionService] insert with user_id failed, retrying legacy schema', insertError)
      // Retry legacy schema
      const legacy = await (db
        .from('profiles')
        .insert({
          id: user.id,
          email,
          role: 'patient',
          external_id: user.id,
        } satisfies DbRow)
        .select('*')
        .single())

      inserted = legacy.data as DbRow | null
      insertError = legacy.error
    }

    if (insertError) {
      throw insertError
    }

    profileRow = inserted
  } else {
    const updates: DbRow = {}

    if (!profileRow.email) {
      updates.email = email
    }

    if (Object.keys(updates).length > 0) {
      const updateTry = await (db
        .from('profiles')
        .update(updates)
        .eq(profileRow['user_id'] ? 'user_id' : 'id', user.id)
        .select('*')
        .single())

      const updated = updateTry.data as DbRow | null
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
}

async function fetchOrCreatePatientImpl(supabase: Db, userId: string): Promise<Patient | null> {
  const db = supabase as unknown as LooseDb
  const { data, error } = await db
    .from('patients')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  let patientRow = data ?? null

  if (!patientRow) {
    const { data: inserted, error: insertError } = await (db
      .from('patients')
      .insert({
        user_id: userId,
        active: true,
      } satisfies DbRow)
      .select('*'))

    if (insertError) {
      throw insertError
    }

    if (Array.isArray(inserted) && inserted.length > 0) {
      patientRow = inserted[0]
    } else if (inserted && !Array.isArray(inserted)) {
      patientRow = inserted
    }
  }

  if (patientRow) {
    const { data: payment } = await db
      .from('appointment_payments')
      .select('id')
      .eq('patient_id', patientRow.id as string)
      .eq('status', 'approved')
      .maybeSingle()

    const hasPaid = !!payment
    const insuranceInfo = (patientRow.insurance_info && typeof patientRow.insurance_info === 'object')
      ? patientRow.insurance_info as Record<string, unknown>
      : {}

    patientRow.insurance_info = {
      ...insuranceInfo,
      has_paid: hasPaid,
    }
  }

  return patientRow ? parsePatient(patientRow) : null
}

export const patientSessionService = {
  async fetchOrCreateProfile(supabase: Db, user: User): Promise<Profile> {
    const key = user.id
    const cached = profileCache.get(key)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

    const inflight = inflightProfiles.get(key)
    if (inflight) return inflight

    const promise: Promise<Profile> = fetchOrCreateProfileImpl(supabase, user)
      .then((profile: Profile) => {
        profileCache.set(key, { data: profile, ts: Date.now() })
        inflightProfiles.delete(key)
        return profile
      })
      .catch((err: unknown) => {
        inflightProfiles.delete(key)
        throw err
      })

    inflightProfiles.set(key, promise)
    return promise
  },

  async fetchOrCreatePatient(supabase: Db, userId: string): Promise<Patient | null> {
    const key = userId
    const cached = patientCache.get(key)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

    const inflight = inflightPatients.get(key)
    if (inflight) return inflight

    const promise: Promise<Patient | null> = fetchOrCreatePatientImpl(supabase, userId)
      .then((patient: Patient | null) => {
        patientCache.set(key, { data: patient, ts: Date.now() })
        inflightPatients.delete(key)
        return patient
      })
      .catch((err: unknown) => {
        inflightPatients.delete(key)
        throw err
      })

    inflightPatients.set(key, promise)
    return promise
  },
}
