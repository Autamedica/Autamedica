/**
 * Service: Medical Order business logic.
 * Frontend orchestration for doctor study/medical orders via internal API routes.
 */
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'
import type {
  MedicalOrder,
  MedicalOrderFilters,
} from '@/types/medical'

export interface MedicalOrderIssuanceResult {
  cuir: string
  qrContent: string
  signedPdfUrl: string | null
  issuedAt: string
}

function buildMedicalOrderQuery(patientId: string, filters: MedicalOrderFilters): string {
  const params = new URLSearchParams({ patientId })

  if (filters.status) params.set('status', filters.status)
  if (filters.study_type) params.set('studyType', filters.study_type)

  return `/api/doctors/medical-orders?${params.toString()}`
}

export const medicalOrderService = {
  async getByPatient(
    patientId: string,
    filters: MedicalOrderFilters = {},
  ): Promise<MedicalOrder[]> {
    return fetchApi<MedicalOrder[]>(buildMedicalOrderQuery(patientId, filters))
  },

  async create(
    patientId: string,
    order: Omit<MedicalOrder, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<MedicalOrder> {
    return fetchApi<MedicalOrder>('/api/doctors/medical-orders', {
      body: {
        patient_id: patientId,
        study_type: order.study_type,
        practices: order.practices,
        diagnosis: order.diagnosis,
        status: order.status,
        notes: order.notes,
      },
    })
  },

  async issue(id: string): Promise<MedicalOrderIssuanceResult> {
    return fetchApi<MedicalOrderIssuanceResult>(`/api/doctors/medical-orders/${id}/issue`, {
      method: 'POST',
    })
  },

  async update(
    id: string,
    _current: MedicalOrder,
    updates: Partial<MedicalOrder>,
  ): Promise<void> {
    await fetchApi<MedicalOrder>(`/api/doctors/medical-orders/${id}`, {
      method: 'PATCH',
      body: {
        study_type: updates.study_type,
        practices: updates.practices,
        diagnosis: updates.diagnosis,
        status: updates.status,
        notes: updates.notes,
      },
    }).catch((error) => {
      logger.error('[medicalOrderService] update failed', { id, error })
      throw error
    })
  },
}
