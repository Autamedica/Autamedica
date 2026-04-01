/**
 * Backend Service: Patient business logic.
 * Orchestrates repository access for API Controllers.
 */
import { patientsRepo } from '@/lib/doctors/lib/repos/patients'
import { logger } from '@autamedica/shared'
import type { PatientWithProfile } from '@autamedica/types'
import { GetRelevantPatientsUseCase } from '../usecases/GetRelevantPatientsUseCase'
import { GetAllRelevantPatientsUseCase } from '../usecases/GetAllRelevantPatientsUseCase'

export const patientBackendService = {
  /**
   * Resolve all active patients in the platform using relevance use case.
   */
  async getActivePatients(): Promise<PatientWithProfile[]> {
    try {
      const useCase = new GetAllRelevantPatientsUseCase(patientsRepo)
      return await useCase.execute()
    } catch (error) {
      logger.error('[patientBackendService] getActivePatients failed', error)
      throw error
    }
  },

  /**
   * Resolve patients assigned to a doctor using the relevance use case.
   */
  async getAssignedPatients(doctorUserId: string): Promise<PatientWithProfile[]> {
    try {
      const useCase = new GetRelevantPatientsUseCase(patientsRepo)
      return await useCase.execute(doctorUserId)
    } catch (error) {
      logger.error('[patientBackendService] getAssignedPatients failed', { doctorUserId, error })
      throw error
    }
  }
}
