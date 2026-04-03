/**
 * Backend Service: Medical Records business logic.
 * Orchestrates repository access for API Controllers.
import type { SupabaseClient } from "@supabase/supabase-js"
 */
import { medicalRecordsRepo } from '@/lib/doctors/lib/repos/medical-records'
import { logger } from '@autamedica/shared'
import type { UiMedicalRecord } from '@/lib/doctors/lib/repos/medical-records'

export interface MedicalRecordsQuery {
  patientId: string
  type?: string
  dateFrom?: string
  dateTo?: string
  diagnosisContains?: string
  page?: number
  pageSize?: number
}

export interface PaginatedMedicalRecords {
  records: UiMedicalRecord[]
  hasMore: boolean
  page: number
  total: number
}

export const medicalRecordsBackendService = {
  async getByPatient(query: MedicalRecordsQuery, client?: SupabaseClient): Promise<PaginatedMedicalRecords> {
    try {
      const { patientId, type, dateFrom, dateTo, diagnosisContains, page = 0, pageSize = 10 } = query

      let records = await medicalRecordsRepo.findByPatient(patientId, type, client)

      if (dateFrom) {
        records = records.filter(r => (r.dateRecorded ?? '') >= dateFrom)
      }

      if (dateTo) {
        records = records.filter(r => (r.dateRecorded ?? '') <= dateTo)
      }

      if (diagnosisContains) {
        const needle = diagnosisContains.toLowerCase()
        records = records.filter(r => {
          const contentStr = typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
          return contentStr.toLowerCase().includes(needle)
        })
      }

      const total = records.length
      const startIdx = page * pageSize
      const paged = records.slice(startIdx, startIdx + pageSize)

      return {
        records: paged,
        hasMore: startIdx + pageSize < total,
        page,
        total,
      }
    } catch (error) {
      logger.error('[medicalRecordsBackendService] getByPatient failed', { query, error })
      throw error
    }
  },
}
