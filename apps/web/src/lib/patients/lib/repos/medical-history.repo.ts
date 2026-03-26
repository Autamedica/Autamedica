/**
 * Repository: medical_records table access for patient-scoped routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

export type MedicalRecordType = 'prescription' | 'diagnosis' | 'allergy' | 'note' | string

export interface MedicalRecord {
  id: string
  patient_id: string
  type: string
  title: string
  content: Record<string, unknown>
  created_at: string
  updated_at: string
}

export const medicalHistoryRepo = {
  async listByType(supabase: Db, patientId: string, type: MedicalRecordType): Promise<MedicalRecord[]> {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', patientId)
      .eq('type', type)

    if (error) {
      logger.error('[medicalHistoryRepo] listByType failed', { type, error })
      throw error
    }

    return (data ?? []) as MedicalRecord[]
  },

  async findById(supabase: Db, patientId: string, recordId: string): Promise<MedicalRecord | null> {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('id', recordId)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (error) {
      logger.error('[medicalHistoryRepo] findById failed', { recordId, error })
      throw error
    }

    return (data as MedicalRecord) ?? null
  },

  async listConsultations(supabase: Db, patientId: string, limit = 50): Promise<MedicalRecord[]> {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', patientId)
      .eq('type', 'consultation')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('[medicalHistoryRepo] listConsultations failed', error)
      throw error
    }

    return (data ?? []) as MedicalRecord[]
  },

  async listAll(supabase: Db, patientId: string, limit = 50): Promise<MedicalRecord[]> {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('[medicalHistoryRepo] listAll failed', error)
      throw error
    }

    return (data ?? []) as MedicalRecord[]
  },

  async insert(
    supabase: Db,
    patientId: string,
    type: MedicalRecordType,
    title: string,
    content: Record<string, unknown>,
  ): Promise<MedicalRecord> {
    const { data, error } = await supabase
      .from('medical_records')
      .insert({
        patient_id: patientId,
        type,
        title,
        content,
      } as never)
      .select('*')
      .single()

    if (error) {
      logger.error('[medicalHistoryRepo] insert failed', { type, error })
      throw error
    }

    return data as MedicalRecord
  },
}
