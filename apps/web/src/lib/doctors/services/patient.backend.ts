/**
 * Backend Service: Patient business logic.
 * Orchestrates repository access for API Controllers.
 */
import { createPatientRepositoryAdapter, patientsRepo } from '@/lib/doctors/lib/repos/patients'
import { createAlertsRepositoryAdapter } from '@/lib/doctors/lib/repos/alerts'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import type { PatientWithProfile, UUID } from '@autamedica/types'
import { GetRelevantPatientsUseCase } from '../usecases/GetRelevantPatientsUseCase'
import { GetAllRelevantPatientsUseCase } from '../usecases/GetAllRelevantPatientsUseCase'

export const patientBackendService = {
  /**
   * Resolve all active patients in the platform using relevance use case.
   * Uses admin client -- auth is validated at the API route level.
   */
  async getActivePatients(): Promise<PatientWithProfile[]> {
    try {
      const admin = createAstroAdminClient()
      const useCase = new GetAllRelevantPatientsUseCase({
        patientRepo: createPatientRepositoryAdapter(admin),
        alertsRepo: createAlertsRepositoryAdapter(admin),
      })
      return await useCase.execute()
    } catch (error) {
      logger.error('[patientBackendService] getActivePatients failed', error)
      throw error
    }
  },

  /**
   * Resolve patients assigned to a doctor using the relevance use case.
   * Uses admin client -- auth is validated at the API route level.
   */
  async getAssignedPatients(doctorUserId: string): Promise<PatientWithProfile[]> {
    try {
      const admin = createAstroAdminClient()
      const useCase = new GetRelevantPatientsUseCase({
        patientRepo: createPatientRepositoryAdapter(admin),
        alertsRepo: createAlertsRepositoryAdapter(admin),
      })
      return await useCase.execute(doctorUserId)
    } catch (error) {
      logger.error('[patientBackendService] getAssignedPatients failed', { doctorUserId, error })
      throw error
    }
  },

  async getPatientsByCompany(companyId: string): Promise<PatientWithProfile[]> {
    try {
      const admin = createAstroAdminClient()
      return await patientsRepo.findByCompany(companyId, admin)
    } catch (error) {
      logger.error('[patientBackendService] getPatientsByCompany failed', { companyId, error })
      throw error
    }
  },

  async getPatientById(id: UUID): Promise<PatientWithProfile | null> {
    try {
      const admin = createAstroAdminClient()
      const patient = await patientsRepo.findById(id, admin)
      return patient ? { ...patient, ...(patient.profile || {}) } : null
    } catch (error) {
      logger.error('[patientBackendService] getPatientById failed', { id, error })
      throw error
    }
  }
}
