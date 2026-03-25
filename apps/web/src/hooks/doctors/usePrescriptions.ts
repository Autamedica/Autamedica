/**
 * Hook: Prescriptions UI state.
 * Consumes prescriptionService for business logic.
 * Only manages React state (loading, error, data) + event coordination.
 */
import { useCallback, useEffect, useState } from 'react'
import { logger } from '@autamedica/shared'
import { prescriptionService } from '@/lib/doctors/services/prescription.service'
import type {
  Prescription,
  PrescriptionFilters,
  UsePrescriptionsResult,
  UUID,
} from '@/types/medical'

interface UsePrescriptionsOptions {
  filters?: PrescriptionFilters
}

const PRESCRIPTIONS_CHANGED_EVENT = 'medical-prescriptions:changed'

export function usePrescriptions(
  patientId: UUID | null,
  options: UsePrescriptionsOptions = {},
): UsePrescriptionsResult {
  const { filters = {} } = options

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => setIsClient(true), [])

  const fetchPrescriptions = useCallback(async (): Promise<void> => {
    if (!patientId || !isClient) {
      setPrescriptions([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await prescriptionService.getByPatient(patientId, filters)
      setPrescriptions(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar prescripciones: ${message}`)
      logger.error('[usePrescriptions] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, patientId, isClient])

  const addPrescription = useCallback(async (
    prescription: Omit<Prescription, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<void> => {
    if (!patientId) {
      throw new Error('ID de paciente requerido')
    }

    setError(null)

    try {
      await prescriptionService.create(patientId, prescription)
      window.dispatchEvent(new Event(PRESCRIPTIONS_CHANGED_EVENT))
      await fetchPrescriptions()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al guardar prescripción: ${message}`)
      logger.error('[usePrescriptions] add error:', err)
      throw err
    }
  }, [fetchPrescriptions, patientId])

  const updatePrescription = useCallback(async (
    id: UUID,
    updates: Partial<Prescription>,
  ): Promise<void> => {
    setError(null)

    try {
      const current = prescriptions.find((p) => p.id === id)
      if (!current) {
        throw new Error('Prescripción no encontrada en memoria')
      }

      await prescriptionService.update(id, current, updates)
      window.dispatchEvent(new Event(PRESCRIPTIONS_CHANGED_EVENT))
      await fetchPrescriptions()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al actualizar prescripción: ${message}`)
      logger.error('[usePrescriptions] update error:', err)
      throw err
    }
  }, [fetchPrescriptions, prescriptions])

  useEffect(() => {
    void fetchPrescriptions()
  }, [fetchPrescriptions])

  useEffect(() => {
    const handleChanged = (): void => {
      void fetchPrescriptions()
    }

    window.addEventListener(PRESCRIPTIONS_CHANGED_EVENT, handleChanged)
    return () => {
      window.removeEventListener(PRESCRIPTIONS_CHANGED_EVENT, handleChanged)
    }
  }, [fetchPrescriptions])

  return {
    prescriptions,
    loading,
    error,
    addPrescription,
    updatePrescription,
  }
}
