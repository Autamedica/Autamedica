/**
 * Backend Service: medical history aggregation and mutation logic.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { createMedicalHistoryAdapter, type MedicalRecord } from '@/lib/patients/lib/repos/medical-history.adapter'

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
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase)

    const [medications, conditions, allergies, timeline, anamnesisRes] = await Promise.all([
      medicalHistoryRepo.listByType(patientId, 'prescription').catch((err) => {
        logger.error('[medicalHistoryService] medications failed', err)
        return []
      }),
      medicalHistoryRepo.listByType(patientId, 'diagnosis').catch((err) => {
        logger.error('[medicalHistoryService] conditions failed', err)
        return []
      }),
      medicalHistoryRepo.listByType(patientId, 'allergy').catch((err) => {
        logger.error('[medicalHistoryService] allergies failed', err)
        return []
      }),
      medicalHistoryRepo.listAll(patientId).catch((err) => {
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
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase)
    return medicalHistoryRepo.insert(patientId, 'allergy', name.trim(), meta)
  },

  async addMedication(
    supabase: Db,
    patientId: string,
    name: string,
    meta: { dosage?: string; frequency?: string; status?: string; notes?: string },
  ): Promise<MedicalRecord> {
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase)
    const content = { ...meta, status: meta.status || 'active' }
    return medicalHistoryRepo.insert(patientId, 'prescription', name.trim(), content)
  },

  async addCondition(
    supabase: Db,
    patientId: string,
    name: string,
    meta: { status?: string; diagnosed_date?: string; notes?: string },
  ): Promise<MedicalRecord> {
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase)
    return medicalHistoryRepo.insert(patientId, 'diagnosis', name.trim(), meta)
  },
}
