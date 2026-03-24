/**
 * Hook migrado al sistema híbrido
 *
 * CAMBIOS:
 * - Usa selectActive() en lugar de supabase directo
 * - Datos retornados en camelCase automáticamente
 * - Auto-filtrado de soft-deleted (deleted_at IS NULL)
 * - Implementa paginación con fetch manual
 */

import { useEffect, useState, useCallback } from 'react'
import { selectActive, logger } from '@autamedica/shared'
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

// Tipo UI (camelCase) for medical_records - matches DB schema after camelCase transform
// DB columns: id, patient_id, doctor_id, appointment_id, title, type, content,
//             date_recorded, attachments, visibility, deleted_at, created_at, updated_at
interface UiMedicalRecord {
  id: string;
  patientId: string | null;
  doctorId: string | null;
  appointmentId: string | null;
  title: string;
  type: string;
  content: unknown;
  dateRecorded: string | null;
  attachments: unknown | null;
  visibility: string | null;
  deletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function useMedicalHistory(
  patientId: UUID | null,
  options: UseMedicalHistoryOptions = {}
): UseMedicalHistoryResult {
  const { pageSize = 10, filters = {} } = options

  // Serialize filters to a stable string to avoid infinite re-renders from object identity changes
  const filtersKey = JSON.stringify(filters)

  const [records, setRecords] = useState<MedicalRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)

  const fetchRecords = useCallback(async (page: number = 0, reset: boolean = true) => {
    if (!patientId) {
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
      // Sistema híbrido: selectActive() retorna camelCase automáticamente
      // DB column: date_recorded (not consultation_date)
      const allRecords = await selectActive<'medical_records', UiMedicalRecord>('medical_records', '*', {
        orderBy: { column: 'date_recorded', ascending: false }
      });

      // Filtrar por patient_id
      let filtered = allRecords.filter(r => r.patientId === patientId);

      // Aplicar filtros adicionales
      // DB column: type (not consultation_type)
      if (stableFilters.consultation_type) {
        filtered = filtered.filter(r => r.type === stableFilters.consultation_type);
      }

      if (stableFilters.date_from) {
        filtered = filtered.filter(r => (r.dateRecorded ?? '') >= (stableFilters.date_from ?? ''));
      }

      if (stableFilters.date_to) {
        filtered = filtered.filter(r => (r.dateRecorded ?? '') <= (stableFilters.date_to ?? ''));
      }

      // content is a JSON field that may contain diagnosis info
      if (stableFilters.diagnosis_contains) {
        filtered = filtered.filter(r => {
          const contentStr = typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
          return contentStr.toLowerCase().includes((stableFilters.diagnosis_contains ?? '').toLowerCase());
        });
      }

      // Paginación manual
      const startIdx = page * pageSize;
      const endIdx = (page + 1) * pageSize;
      const newRecords = filtered.slice(startIdx, endIdx);

      if (reset) {
        setRecords(newRecords as unknown as MedicalRecord[]);
      } else {
        setRecords(prev => [...prev, ...(newRecords as unknown as MedicalRecord[])]);
      }

      // Verificar si hay más páginas
      setHasMore(endIdx < filtered.length);
      setCurrentPage(page);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar historial médico: ${errorMessage}`)
      logger.error('[useMedicalHistory] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [patientId, pageSize, filtersKey])

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return
    await fetchRecords(currentPage + 1, false)
  }, [fetchRecords, currentPage, hasMore, loading])

  useEffect(() => {
    fetchRecords(0, true)
  }, [fetchRecords])

  return {
    records,
    loading,
    error,
    loadMore,
    hasMore
  }
}