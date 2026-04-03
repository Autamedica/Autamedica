/**
 * Repository: patients table access.
 * Single source of truth for all DB queries related to patients and care teams.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import type { Database } from '@autamedica/types'
import { toCamel, logger } from '@autamedica/shared'
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
    role: string | null, address: string | null, emergency_contact_name: string | null, emergency_contact_phone: string | null, allergies: string[] | string | null, chronic_conditions: string[] | string | null, insurance_provider: string | null, insurance_number: string | null
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
        role, address, emergency_contact_name, emergency_contact_phone, allergies, chronic_conditions, insurance_provider, insurance_number
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
    const { data, error } = await queryWithProfile(client)
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
    const { data, error } = await queryWithProfile(client)
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
   * Resolves patients assigned to a specific doctor via care team.
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

    // 2. Get assigned patient IDs
    const { data: assignments, error: careError } = await client
      .from('patient_care_team')
      .select('patient_id')
      .eq('doctor_id', doctor.id)
      .eq('active', true)

    if (careError || !assignments || assignments.length === 0) {
      return []
    }

    const patientIds = assignments.map(a => a.patient_id)

    // 3. Fetch patient profiles for those IDs
    const { data: patients, error: patError } = await queryWithProfile(client)
      .in('id', patientIds)
      .eq('active', true)

    if (patError) {
      logger.error('[patientsRepo] findByDoctorUserId failed fetching patients', patError)
      throw patError
    }

    return toCamel<PatientWithProfile[]>(patients ?? [])
  }
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
  async update(
    id: UUID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updates: any,
    client: PatientsClient = getBrowserSupabaseClient(),
  ): Promise<void> {
    const { profile, ...patientData } = updates
    
    if (Object.keys(patientData).length > 0) {
      const { error } = await client.from("patients").update(toSnake(patientData)).eq("id", id)
      if (error) throw error
    }

    if (profile) {
      const { data: p } = await client.from("patients").select("user_id").eq("id", id).single()
      if (p?.user_id) {
        const { error } = await client.from("profiles").update(toSnake(profile)).eq("user_id", p.user_id)
        if (error) throw error
      }
    }
  },
    findByDoctorUserId: (doctorUserId) => patientsRepo.findByDoctorUserId(doctorUserId, client),
  }
}
