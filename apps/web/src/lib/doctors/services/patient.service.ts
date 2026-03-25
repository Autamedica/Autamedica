/**
 * Frontend Service: Patient business logic.
 * Orchestrates API access through fetchApi call to Backend Controller.
 * This is the 3rd layer of the 7-layer architecture.
 */
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'
import type { PatientWithProfile, UUID } from '@autamedica/types'

export const patientService = {
  /**
   * Fetch all active patients in the system.
   */
  async getActivePatients(): Promise<PatientWithProfile[]> {
    try {
      return await fetchApi<PatientWithProfile[]>('/api/doctors/patients')
    } catch (error) {
      logger.error('[patientService] getActivePatients failed', error)
      throw error
    }
  },

  /**
   * Get a single patient by their public ID.
   */
  async getPatientById(id: UUID): Promise<PatientWithProfile | null> {
    try {
      return await fetchApi<PatientWithProfile | null>(`/api/doctors/patients?id=${id}`)
    } catch (error) {
      logger.error('[patientService] getPatientById failed', { id, error })
      throw error
    }
  },

  /**
   * Get all patients assigned to a doctor through care team correctly.
   */
  async getAssignedPatients(doctorUserId: string): Promise<PatientWithProfile[]> {
    try {
      return await fetchApi<PatientWithProfile[]>(`/api/doctors/patients?doctorUserId=${doctorUserId}`)
    } catch (error) {
      logger.error('[patientService] getAssignedPatients failed', { doctorUserId, error })
      throw error
    }
  }
}
