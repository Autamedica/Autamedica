/**
 * Backend Service: Doctor business logic.
 * Orchestrates repository access for API Controllers.
 */
import { createDoctorRepositoryAdapter } from '@/lib/doctors/lib/repos/doctors'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import type { DoctorWithProfile } from '@autamedica/types'

export const doctorBackendService = {
  async getDoctors(): Promise<DoctorWithProfile[]> {
    try {
      const repo = createDoctorRepositoryAdapter(createAstroAdminClient())
      return await repo.findAll()
    } catch (error) {
      logger.error('[doctorBackendService] getDoctors failed', error)
      throw error
    }
  },

  async getDoctorByUserId(userId: string): Promise<DoctorWithProfile | null> {
    try {
      const repo = createDoctorRepositoryAdapter(createAstroAdminClient())
      return await repo.findByUserId(userId)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorByUserId failed', { userId, error })
      throw error
    }
  },

  async getDoctorById(id: string): Promise<DoctorWithProfile | null> {
    try {
      const repo = createDoctorRepositoryAdapter(createAstroAdminClient())
      return await repo.findById(id)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorById failed', { id, error })
      throw error
    }
  },

  async getDoctorsBySpecialty(specialty: string): Promise<DoctorWithProfile[]> {
    try {
      const repo = createDoctorRepositoryAdapter(createAstroAdminClient())
      return await repo.findBySpecialty(specialty)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorsBySpecialty failed', { specialty, error })
      throw error
    }
  },
}
