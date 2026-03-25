/**
 * Backend Service: Doctor business logic.
 * Orchestrates repository access for API Controllers.
 */
import { doctorsRepo } from '@/lib/doctors/lib/repos/doctors'
import { logger } from '@autamedica/shared'
import type { DoctorWithProfile } from '@autamedica/types'

export const doctorBackendService = {
  async getDoctors(): Promise<DoctorWithProfile[]> {
    try {
      return await doctorsRepo.findAll()
    } catch (error) {
      logger.error('[doctorBackendService] getDoctors failed', error)
      throw error
    }
  },

  async getDoctorByUserId(userId: string): Promise<DoctorWithProfile | null> {
    try {
      return await doctorsRepo.findByUserId(userId)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorByUserId failed', { userId, error })
      throw error
    }
  },

  async getDoctorById(id: string): Promise<DoctorWithProfile | null> {
    try {
      return await doctorsRepo.findById(id)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorById failed', { id, error })
      throw error
    }
  },

  async getDoctorsBySpecialty(specialty: string): Promise<DoctorWithProfile[]> {
    try {
      return await doctorsRepo.findBySpecialty(specialty)
    } catch (error) {
      logger.error('[doctorBackendService] getDoctorsBySpecialty failed', { specialty, error })
      throw error
    }
  },
}
