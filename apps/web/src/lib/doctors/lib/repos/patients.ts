/**
 * Repository: patients table access.
 * Single source of truth for all DB queries related to patients and care teams.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import type { Database } from '@autamedica/types'
import { toCamel, toSnake, logger } from '@autamedica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PatientWithProfile, UUID, IPatientRepository } from '@autamedica/types'

// DB Row structure (simplified for camelCase mapping)
export interface PatientRow {
  id: string
  user_id: string
  dni: string | null
  birth_date: string | null
  gender: string | null
  blood_type: string | null
  active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  profile?: {
    user_id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    avatar_url: string | null
    role: string | null
  }
}

type PatientsClient = SupabaseClient<Database>

function queryWithProfile(client: PatientsClient = getBrowserSupabaseClient()) {
  return client
    .from('patients')
    .select(`
      *,
      profile:profiles!inner(
        user_id,
        first_name,
        last_name,
        email,
        phone,
        avatar_url,
        role
      )
    `)
}

export const patientsRepo = {
  async findAllActive(client: PatientsClient = getBrowserSupabaseClient()): Promise<PatientWithProfile[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (queryWithProfile(client) as any)
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[patientsRepo] findAllActive failed', error)
      throw error
    }

    return toCamel<PatientWithProfile[]>(data ?? [])
  },

  async findById(
    id: UUID,
    client: PatientsClient = getBrowserSupabaseClient(),
  ): Promise<PatientWithProfile | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (queryWithProfile(client) as any)
      .eq('id', id)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      logger.error('[patientsRepo] findById failed', error)
      throw error
    }

    return toCamel<PatientWithProfile>(data)
  },

  async findByUserId(
    userId: string,
    client: PatientsClient = getBrowserSupabaseClient(),
  ): Promise<PatientWithProfile | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (queryWithProfile(client) as any)
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      logger.error('[patientsRepo] findByUserId failed', error)
      throw error
    }

    return toCamel<PatientWithProfile>(data)
  },

  async findByCompany(
    companyId: string,
    client: PatientsClient = getBrowserSupabaseClient(),
  ): Promise<PatientWithProfile[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (queryWithProfile(client) as any)
      .eq('company_id', companyId)
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[patientsRepo] findByCompany failed', error)
      throw error
    }

    return toCamel<PatientWithProfile[]>(data ?? [])
  },

  /**
   * Resolves patients assigned to a specific doctor via care team AND appointments.
   * Merges both sources so doctors see all patients they've interacted with.
   */
  async findByDoctorUserId(
    doctorUserId: string,
    client: PatientsClient = getBrowserSupabaseClient(),
  ): Promise<PatientWithProfile[]> {
    // 1. Resolve doctor record ID first
    const { data: doctor, error: docError } = await client
      .from('doctors')
      .select('id')
      .eq('user_id', doctorUserId)
      .single()

    if (docError || !doctor) {
      logger.warn('[patientsRepo] Doctor record not found for user', doctorUserId)
      return []
    }

    // 2. Get patient IDs from care team
    const { data: assignments } = await client
      .from('patient_care_team')
      .select('patient_id')
      .eq('doctor_id', doctor.id)
      .eq('active', true)

    const careTeamIds = (assignments ?? []).map(a => a.patient_id)

    // 3. Get patient IDs from appointments (doctors also see patients they have appointments with)
    const { data: appointmentPatients } = await client
      .from('appointments')
      .select('patient_id')
      .eq('doctor_id', doctor.id)
      .neq('status', 'cancelled')

    const appointmentIds = (appointmentPatients ?? [])
      .map(a => a.patient_id)
      .filter((id): id is string => typeof id === 'string')

    // 4. Merge and deduplicate patient IDs
    const allPatientIds = [...new Set([...careTeamIds, ...appointmentIds])]

    if (allPatientIds.length === 0) {
      return []
    }

    // 5. Fetch patient profiles for those IDs
    const { data: patients, error: patError } = await queryWithProfile(client)
      .in('id', allPatientIds)
      .eq('active', true)

    if (patError) {
      logger.error('[patientsRepo] findByDoctorUserId failed fetching patients', patError)
      throw patError
    }

    return toCamel<PatientWithProfile[]>(patients ?? [])
  },

  async update(
    id: UUID,
    updates: Record<string, unknown>,
    client: PatientsClient = getBrowserSupabaseClient(),
  ): Promise<void> {
    const { profile, ...patientData } = updates

    if (Object.keys(patientData).length > 0) {
      const { error } = await client.from('patients').update(toSnake(patientData) as never).eq('id', id)
      if (error) throw error
    }

    if (profile) {
      const { data: p } = await client.from('patients').select('user_id').eq('id', id).single()
      if (p?.user_id) {
        const { error } = await client.from('profiles').update(toSnake(profile) as never).eq('user_id', p.user_id)
        if (error) throw error
      }
    }
  },
}

/**
 * Factory: crea un adapter que implementa IPatientRepository
 * cerrando sobre un SupabaseClient específico.
 * Útil para use cases con inversión de dependencias y testing.
 */
export function createPatientRepositoryAdapter(
  client: PatientsClient = getBrowserSupabaseClient()
): IPatientRepository {
  return {
    findAllActive: () => patientsRepo.findAllActive(client),
    findById: (id) => patientsRepo.findById(id, client),
    findByUserId: (userId) => patientsRepo.findByUserId(userId, client),
    findByCompany: (companyId) => patientsRepo.findByCompany(companyId, client),
    findByDoctorUserId: (doctorUserId) => patientsRepo.findByDoctorUserId(doctorUserId, client),
  }
}
