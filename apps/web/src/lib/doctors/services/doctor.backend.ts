/**
 * Backend Service: Doctor business logic.
 * Orchestrates repository access for API Controllers.
 */
import { createDoctorRepositoryAdapter } from '@/lib/doctors/lib/repos/doctors'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import type { DoctorWithProfile } from '@autamedica/types'

type RuntimeEnv = Record<string, unknown> | null | undefined

export const doctorBackendService = {
  async getDoctors(runtimeEnv?: RuntimeEnv): Promise<DoctorWithProfile[]> {
    try {
      const repo = createDoctorRepositoryAdapter(createAstroAdminClient(runtimeEnv))
      return await repo.findAll()
    } catch (error) {
      logger.error('[doctorBackendService] getDoctors failed', error)
      throw error
    }
  },

  async getDoctorByUserId(
    userId: string,
    runtimeEnv?: RuntimeEnv,
  ): Promise<DoctorWithProfile | null> {
    try {
      const repo = createDoctorRepositoryAdapter(createAstroAdminClient(runtimeEnv))
      return await repo.findByUserId(userId)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorByUserId failed', { userId, error })
      throw error
    }
  },

  async getDoctorById(
    id: string,
    runtimeEnv?: RuntimeEnv,
  ): Promise<DoctorWithProfile | null> {
    try {
      const repo = createDoctorRepositoryAdapter(createAstroAdminClient(runtimeEnv))
      return await repo.findById(id)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorById failed', { id, error })
      throw error
    }
  },

  async getDoctorsBySpecialty(
    specialty: string,
    runtimeEnv?: RuntimeEnv,
  ): Promise<DoctorWithProfile[]> {
    try {
      const repo = createDoctorRepositoryAdapter(createAstroAdminClient(runtimeEnv))
      return await repo.findBySpecialty(specialty)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorsBySpecialty failed', { specialty, error })
      throw error
    }
  },
}
