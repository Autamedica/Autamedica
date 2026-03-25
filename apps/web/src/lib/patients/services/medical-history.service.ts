/**
 * Backend Service: medical history aggregation and mutation logic.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { medicalHistoryRepo, type MedicalRecord } from '@/lib/patients/lib/repos/medical-history.repo'

type Db = SupabaseClient<Database>

export interface MedicalHistorySnapshot {
  summary: {
    medications: MedicalRecord[]
    conditions: MedicalRecord[]
    allergies: MedicalRecord[]
  }
  timeline: MedicalRecord[]
  anamnesis: unknown[]
}

export const medicalHistoryService = {
  async getFullHistory(supabase: Db, patientId: string): Promise<MedicalHistorySnapshot> {
    const [medications, conditions, allergies, timeline, anamnesisRes] = await Promise.all([
      medicalHistoryRepo.listByType(supabase, patientId, 'prescription').catch((err) => {
        logger.error('[medicalHistoryService] medications failed', err)
        return []
      }),
      medicalHistoryRepo.listByType(supabase, patientId, 'diagnosis').catch((err) => {
        logger.error('[medicalHistoryService] conditions failed', err)
        return []
      }),
      medicalHistoryRepo.listByType(supabase, patientId, 'allergy').catch((err) => {
        logger.error('[medicalHistoryService] allergies failed', err)
        return []
      }),
      medicalHistoryRepo.listAll(supabase, patientId).catch((err) => {
        logger.error('[medicalHistoryService] timeline failed', err)
        return []
      }),
      supabase
        .from('anamnesis')
        .select('*')
        .eq('patient_id', patientId)
        .then(({ data, error }) => {
          if (error) logger.error('[medicalHistoryService] anamnesis failed', error)
          return data ?? []
        }),
    ])

    return {
      summary: { medications, conditions, allergies },
      timeline,
      anamnesis: anamnesisRes,
    }
  },

  async addAllergy(
    supabase: Db,
    patientId: string,
    name: string,
    meta: { severity?: string; reaction?: string; notes?: string },
  ): Promise<MedicalRecord> {
    return medicalHistoryRepo.insert(supabase, patientId, 'allergy', name.trim(), meta)
  },

  async addMedication(
    supabase: Db,
    patientId: string,
    name: string,
    meta: { dosage?: string; frequency?: string; status?: string; notes?: string },
  ): Promise<MedicalRecord> {
    const content = { ...meta, status: meta.status || 'active' }
    return medicalHistoryRepo.insert(supabase, patientId, 'prescription', name.trim(), content)
  },

  async addCondition(
    supabase: Db,
    patientId: string,
    name: string,
    meta: { status?: string; diagnosed_date?: string; notes?: string },
  ): Promise<MedicalRecord> {
    return medicalHistoryRepo.insert(supabase, patientId, 'diagnosis', name.trim(), meta)
  },
}
