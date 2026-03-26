/**
 * Backend Service: Patient business logic.
 * Orchestrates repository access for API Controllers.
 */
import { patientsRepo } from '@/lib/doctors/lib/repos/patients'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import type { PatientWithProfile, UUID } from '@autamedica/types'

export const patientBackendService = {
  /**
   * List all patients available for the requesting user context.
   */
  async getActivePatients(): Promise<PatientWithProfile[]> {
    try {
      return await patientsRepo.findAllActive(createAstroAdminClient())
    } catch (error) {
      logger.error('[patientBackendService] getActivePatients failed', error)
      throw error
    }
  },

  /**
   * Get formatted patient detail.
   */
  async getPatientById(id: UUID): Promise<PatientWithProfile | null> {
    try {
      return await patientsRepo.findById(id, createAstroAdminClient())
    } catch (error) {
      logger.error('[patientBackendService] getPatientById failed', { id, error })
      throw error
    }
  },

  /**
   * Resolve patients assigned to a doctor.
   */
  async getAssignedPatients(doctorUserId: string): Promise<PatientWithProfile[]> {
    try {
      return await patientsRepo.findByDoctorUserId(doctorUserId, createAstroAdminClient())
    } catch (error) {
      logger.error('[patientBackendService] getAssignedPatients failed', { doctorUserId, error })
      throw error
    }
  }
}
