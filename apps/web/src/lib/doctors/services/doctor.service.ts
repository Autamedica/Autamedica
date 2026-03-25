/**
 * Frontend Service: Doctor business logic.
 * Orchestrates API access through fetchApi call to Backend Controller.
 * Layer 3 of the 7-layer architecture.
 */
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'
import type { DoctorWithProfile } from '@autamedica/types'

export const doctorService = {
  async getDoctors(): Promise<DoctorWithProfile[]> {
    try {
      return await fetchApi<DoctorWithProfile[]>('/api/doctors/profile')
    } catch (error) {
      logger.error('[doctorService] getDoctors failed', error)
      throw error
    }
  },

  async getDoctorByUserId(userId: string): Promise<DoctorWithProfile | null> {
    try {
      return await fetchApi<DoctorWithProfile | null>(`/api/doctors/profile?userId=${userId}`)
    } catch (error) {
      logger.error('[doctorService] getDoctorByUserId failed', { userId, error })
      throw error
    }
  },

  async getDoctorById(id: string): Promise<DoctorWithProfile | null> {
    try {
      return await fetchApi<DoctorWithProfile | null>(`/api/doctors/profile?id=${id}`)
    } catch (error) {
      logger.error('[doctorService] getDoctorById failed', { id, error })
      throw error
    }
  },

  async getDoctorsBySpecialty(specialty: string): Promise<DoctorWithProfile[]> {
    try {
      return await fetchApi<DoctorWithProfile[]>(`/api/doctors/profile?specialty=${encodeURIComponent(specialty)}`)
    } catch (error) {
      logger.error('[doctorService] getDoctorsBySpecialty failed', { specialty, error })
      throw error
    }
  },
}
