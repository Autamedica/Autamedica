/**
 * Backend Service: Patient business logic.
 * Orchestrates repository access for API Controllers.
 */
import { createPatientRepositoryAdapter, patientsRepo } from '@/lib/doctors/lib/repos/patients'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PatientWithProfile, UUID } from '@autamedica/types'
import { GetRelevantPatientsUseCase } from '../usecases/GetRelevantPatientsUseCase'
import { GetAllRelevantPatientsUseCase } from '../usecases/GetAllRelevantPatientsUseCase'

export const patientBackendService = {
  /**
   * Resolve all active patients in the platform using relevance use case.
   * Uses admin client — auth is validated at the API route level.
   */
  async getActivePatients(_client?: SupabaseClient): Promise<PatientWithProfile[]> {
    try {
      const admin = createAstroAdminClient()
      const repo = createPatientRepositoryAdapter(admin)
      const useCase = new GetAllRelevantPatientsUseCase(repo)
      return await useCase.execute(admin)
    } catch (error) {
      logger.error('[patientBackendService] getActivePatients failed', error)
      throw error
    }
  },

  /**
   * Resolve patients assigned to a doctor using the relevance use case.
   * Uses admin client — auth is validated at the API route level.
   */
  async getAssignedPatients(doctorUserId: string, _client?: SupabaseClient): Promise<PatientWithProfile[]> {
    try {
      const admin = createAstroAdminClient()
      const repo = createPatientRepositoryAdapter(admin)
      const useCase = new GetRelevantPatientsUseCase(repo)
      return await useCase.execute(doctorUserId, admin)
    } catch (error) {
      logger.error('[patientBackendService] getAssignedPatients failed', { doctorUserId, error })
      throw error
    }
  },

  async getPatientById(id: UUID, _client?: SupabaseClient): Promise<PatientWithProfile | null> {
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
