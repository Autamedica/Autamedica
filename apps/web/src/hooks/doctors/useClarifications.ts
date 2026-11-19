'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'

export interface DoctorClarification {
  id: string
  order_id: string
  prescription_id: string
  patient_id: string | null
  medication: string
  pharmacy_name: string | null
  question: string
  question_category: string | null
  requested_at: string
  expires_at: string | null
  order_status: string
}

export interface ClarifyResult {
  clarificationId: string
  orderStatus: string
  respondedAt: string
}

export const CLARIFICATION_CATEGORY_LABEL: Record<string, string> = {
  dose_verification: 'Verificación de dosis',
  formulation_mismatch: 'Presentación distinta',
  duration_concern: 'Duración del tratamiento',
  interaction_alert: 'Posible interacción',
  bridge_protocol: 'Protocolo puente',
  identity_concern: 'Verificación de identidad',
  other: 'Otra consulta',
}

interface UseClarificationsReturn {
  clarifications: DoctorClarification[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  respond: (prescriptionId: string, clarificationId: string, response: string) => Promise<ClarifyResult>
}

/**
 * Controller de aclaraciones de farmacia para el médico.
 *
 * Lista las órdenes de dispensación en espera de aclaración y envía la
 * respuesta del prescriptor. La lógica de escritura vive en el BFF
 * (`/api/doctors/prescriptions/[id]/clarify`).
 */
export function useClarifications(): UseClarificationsReturn {
  const [clarifications, setClarifications] = useState<DoctorClarification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchApi<DoctorClarification[]>('/api/doctors/prescriptions/clarifications')
      setClarifications(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar las aclaraciones.'
      setError(message)
      logger.error('Error in useClarifications:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const respond = useCallback(async (
    prescriptionId: string,
    clarificationId: string,
    response: string,
  ): Promise<ClarifyResult> => {
    return fetchApi<ClarifyResult>(
      `/api/doctors/prescriptions/${encodeURIComponent(prescriptionId)}/clarify`,
      {
        method: 'POST',
        body: { clarification_id: clarificationId, response },
      },
    )
  }, [])

  return { clarifications, loading, error, refresh, respond }
}