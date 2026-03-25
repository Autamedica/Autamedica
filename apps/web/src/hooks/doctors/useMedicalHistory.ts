/**
 * Hook: Medical History UI State.
 * Consumes medicalRecordsService for all business logic and DB access.
 * Only manages React state (loading, error, data) + pagination.
 */
import { useEffect, useState, useCallback } from 'react'
import { logger } from '@autamedica/shared'
import { medicalRecordsService } from '@/lib/doctors/services/medical-records.service'
import type { MedicalRecordsFilter } from '@/lib/doctors/services/medical-records.service'
import type {
  MedicalRecord,
  UseMedicalHistoryResult,
  UUID,
  MedicalRecordFilters
} from '@/types/medical'

interface UseMedicalHistoryOptions {
  pageSize?: number
  filters?: MedicalRecordFilters
}

export function useMedicalHistory(
  patientId: UUID | null,
  options: UseMedicalHistoryOptions = {}
): UseMedicalHistoryResult {
  const { pageSize = 10, filters = {} } = options
  const filtersKey = JSON.stringify(filters)

  const [records, setRecords] = useState<MedicalRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)

  const [isClient, setIsClient] = useState(false)
  useEffect(() => setIsClient(true), [])

  const fetchRecords = useCallback(async (page: number = 0, reset: boolean = true) => {
    if (!patientId || !isClient) {
      if (reset) {
        setRecords([])
        setHasMore(false)
      }
      return
    }

    setLoading(true)
    setError(null)

    const stableFilters: MedicalRecordFilters = JSON.parse(filtersKey)

    try {
      const serviceFilters: MedicalRecordsFilter = {
        type: stableFilters.consultation_type,
        dateFrom: stableFilters.date_from,
        dateTo: stableFilters.date_to,
        diagnosisContains: stableFilters.diagnosis_contains,
      }

      const result = await medicalRecordsService.getByPatient(patientId, serviceFilters, page, pageSize)

      const newRecords = result.records as unknown as MedicalRecord[]

      if (reset) {
        setRecords(newRecords)
      } else {
        setRecords(prev => [...prev, ...newRecords])
      }

      setHasMore(result.hasMore)
      setCurrentPage(page)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar historial médico: ${errorMessage}`)
      logger.error('[useMedicalHistory] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [patientId, pageSize, filtersKey, isClient])

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return
    await fetchRecords(currentPage + 1, false)
  }, [fetchRecords, currentPage, hasMore, loading])

  useEffect(() => {
    void fetchRecords(0, true)
  }, [fetchRecords])

  return {
    records,
    loading,
    error,
    loadMore,
    hasMore
  }
}
