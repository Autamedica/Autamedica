/**
 * Service: Prescription business logic.
 * Frontend orchestration for doctor prescriptions via internal API routes.
 */
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'
import type {
  Prescription,
  PrescriptionFilters,
} from '@/types/medical'

function buildPrescriptionQuery(patientId: string, filters: PrescriptionFilters): string {
  const params = new URLSearchParams({ patientId })

  if (filters.medication_name) params.set('medicationName', filters.medication_name)
  if (filters.status) params.set('status', filters.status)
  if (filters.active_only) params.set('activeOnly', 'true')

  return `/api/doctors/prescriptions?${params.toString()}`
}

export const prescriptionService = {
  async getByPatient(
    patientId: string,
    filters: PrescriptionFilters = {},
  ): Promise<Prescription[]> {
    return fetchApi<Prescription[]>(buildPrescriptionQuery(patientId, filters))
  },

  async create(
    patientId: string,
    prescription: Omit<Prescription, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<void> {
    await fetchApi<Prescription>('/api/doctors/prescriptions', {
      body: {
        patient_id: patientId,
        medication_name: prescription.medication_name,
        dosage: prescription.dosage,
        frequency: prescription.frequency,
        duration: prescription.duration,
        instructions: prescription.instructions,
        diagnosis: prescription.diagnosis,
        status: prescription.status,
        prescribed_date: prescription.prescribed_date,
        start_date: prescription.start_date,
        end_date: prescription.end_date,
        notes: prescription.notes,
        side_effects_warning: prescription.side_effects_warning,
      },
    })
  },

  async update(
    id: string,
    _current: Prescription,
    updates: Partial<Prescription>,
  ): Promise<void> {
    await fetchApi<Prescription>(`/api/doctors/prescriptions/${id}`, {
      method: 'PATCH',
      body: {
        medication_name: updates.medication_name,
        dosage: updates.dosage,
        frequency: updates.frequency,
        duration: updates.duration,
        instructions: updates.instructions,
        diagnosis: updates.diagnosis,
        status: updates.status,
        prescribed_date: updates.prescribed_date,
        start_date: updates.start_date,
        end_date: updates.end_date,
        notes: updates.notes,
        side_effects_warning: updates.side_effects_warning,
      },
    }).catch((error) => {
      logger.error('[prescriptionService] update failed', { id, error })
      throw error
    })
  },
}
