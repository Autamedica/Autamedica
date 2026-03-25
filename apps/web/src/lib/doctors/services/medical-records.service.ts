/**
 * Frontend Service: Medical Records business logic.
 * Orchestrates API access through fetchApi.
 * Layer 3 of the 7-layer architecture.
 */
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'
import type { UiMedicalRecord } from '@/lib/doctors/lib/repos/medical-records'

export interface MedicalRecordsFilter {
  type?: string
  dateFrom?: string
  dateTo?: string
  diagnosisContains?: string
}

export interface PaginatedMedicalRecords {
  records: UiMedicalRecord[]
  hasMore: boolean
  page: number
  total: number
}

export const medicalRecordsService = {
  async getByPatient(
    patientId: string,
    filters: MedicalRecordsFilter = {},
    page = 0,
    pageSize = 10,
  ): Promise<PaginatedMedicalRecords> {
    try {
      const params = new URLSearchParams({ patientId, page: String(page), pageSize: String(pageSize) })

      if (filters.type) params.set('type', filters.type)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.diagnosisContains) params.set('diagnosisContains', filters.diagnosisContains)

      return await fetchApi<PaginatedMedicalRecords>(`/api/doctors/medical-records?${params.toString()}`)
    } catch (error) {
      logger.error('[medicalRecordsService] getByPatient failed', { patientId, error })
      throw error
    }
  },
}
