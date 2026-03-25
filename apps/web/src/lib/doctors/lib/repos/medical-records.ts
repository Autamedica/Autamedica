/**
 * Repository: medical_records table access.
 * Single source of truth for all DB queries on medical_records.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { toCamel, toSnake, logger } from '@autamedica/shared'

export interface MedicalRecordRow {
  id: string
  patient_id: string | null
  doctor_id: string | null
  title: string
  type: string
  content: unknown
  visibility: string | null
  date_recorded: string | null
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
}

export interface UiMedicalRecord {
  id: string
  patientId: string | null
  doctorId: string | null
  title: string
  type: string
  content: unknown
  visibility: string | null
  dateRecorded: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface MedicalRecordInsert {
  patientId: string
  doctorId: string | null
  type: string
  title: string
  visibility?: string
  dateRecorded?: string
  content: Record<string, unknown>
}

export interface MedicalRecordUpdate {
  doctorId?: string | null
  title?: string
  dateRecorded?: string
  content?: Record<string, unknown>
}

export const medicalRecordsRepo = {
  async findByPatient(patientId: string, type?: string): Promise<UiMedicalRecord[]> {
    const supabase = getBrowserSupabaseClient()
    let query = supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('date_recorded', { ascending: false })

    if (type) {
      query = query.eq('type', type)
    }

    const { data, error } = await query

    if (error) {
      logger.error('[medicalRecordsRepo] findByPatient failed', error)
      throw error
    }

    return toCamel<UiMedicalRecord[]>(data ?? [])
  },

  async insert(record: MedicalRecordInsert): Promise<void> {
    const supabase = getBrowserSupabaseClient()
    const dbPayload = toSnake(record)
    const { error } = await supabase
      .from('medical_records')
      .insert(dbPayload as never)

    if (error) {
      logger.error('[medicalRecordsRepo] insert failed', error)
      throw error
    }
  },

  async update(id: string, updates: MedicalRecordUpdate): Promise<void> {
    const supabase = getBrowserSupabaseClient()
    const dbPayload = toSnake(updates) as Record<string, unknown>
    const { error } = await supabase
      .from('medical_records')
      .update(dbPayload)
      .eq('id', id)

    if (error) {
      logger.error('[medicalRecordsRepo] update failed', error)
      throw error
    }
  },

  async resolveDoctorIdByUser(userId: string): Promise<string | null> {
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.warn('[medicalRecordsRepo] resolveDoctorIdByUser failed', error)
      return null
    }

    return data?.id ?? null
  },
}
