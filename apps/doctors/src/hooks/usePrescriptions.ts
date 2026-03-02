/**
 * usePrescriptions - Stub
 *
 * La tabla `prescriptions` aún no existe en la base de datos.
 * Este hook retorna datos vacíos para que la UI funcione sin errores.
 * Cuando la tabla se cree, reemplazar con la implementación real.
 */

import type {
  Prescription,
  PrescriptionFilters,
  UsePrescriptionsResult,
  UUID
} from '@/types/medical'
import { logger } from '@autamedica/shared'
import { useCallback, useState } from 'react'

interface UsePrescriptionsOptions {
  filters?: PrescriptionFilters
}

export function usePrescriptions(
  patientId: UUID | null,
  _options: UsePrescriptionsOptions = {}
): UsePrescriptionsResult {
  const [prescriptions] = useState<Prescription[]>([])
  const [loading] = useState(false)
  const [error] = useState<string | null>(null)

  const addPrescription = useCallback(async (
    _prescription: Omit<Prescription, 'id' | 'created_at' | 'updated_at'>
  ): Promise<void> => {
    logger.warn('[usePrescriptions] Tabla prescriptions no existe aún en la DB. Operación ignorada.')
  }, [])

  const updatePrescription = useCallback(async (
    _id: UUID,
    _updates: Partial<Prescription>
  ): Promise<void> => {
    logger.warn('[usePrescriptions] Tabla prescriptions no existe aún en la DB. Operación ignorada.')
  }, [])

  return {
    prescriptions,
    loading,
    error,
    addPrescription,
    updatePrescription,
  }
}
