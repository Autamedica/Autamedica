/**
 * Repository: patients table access.
 * Single source of truth for all DB queries related to patients and care teams.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { toCamel, logger } from '@autamedica/shared'
import type { PatientWithProfile, UUID } from '@autamedica/types'

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

function queryWithProfile() {
  return getBrowserSupabaseClient()
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
  async findAllActive(): Promise<PatientWithProfile[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (queryWithProfile() as any)
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[patientsRepo] findAllActive failed', error)
      throw error
    }

    return toCamel<PatientWithProfile[]>(data ?? [])
  },

  async findById(id: UUID): Promise<PatientWithProfile | null> {
    const { data, error } = await queryWithProfile()
      .eq('id', id)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      logger.error('[patientsRepo] findById failed', error)
      throw error
    }

    return toCamel<PatientWithProfile>(data)
  },

  async findByUserId(userId: string): Promise<PatientWithProfile | null> {
    const { data, error } = await queryWithProfile()
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      logger.error('[patientsRepo] findByUserId failed', error)
      throw error
    }

    return toCamel<PatientWithProfile>(data)
  },

  async findByCompany(companyId: string): Promise<PatientWithProfile[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (queryWithProfile() as any)
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
  async findByDoctorUserId(doctorUserId: string): Promise<PatientWithProfile[]> {
    const supabase = getBrowserSupabaseClient()
    
    // 1. Resolve doctor record ID first
    const { data: doctor, error: docError } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', doctorUserId)
      .single()

    if (docError || !doctor) {
      logger.warn('[patientsRepo] Doctor record not found for user', doctorUserId)
      return []
    }

    // 2. Get assigned patient IDs
    const { data: assignments, error: careError } = await supabase
      .from('patient_care_team')
      .select('patient_id')
      .eq('doctor_id', doctor.id)
      .eq('active', true)

    if (careError || !assignments || assignments.length === 0) {
      return []
    }

    const patientIds = assignments.map(a => a.patient_id)

    // 3. Fetch patient profiles for those IDs
    const { data: patients, error: patError } = await queryWithProfile()
      .in('id', patientIds)
      .eq('active', true)

    if (patError) {
      logger.error('[patientsRepo] findByDoctorUserId failed fetching patients', patError)
      throw patError
    }

    return toCamel<PatientWithProfile[]>(patients ?? [])
  }
}
