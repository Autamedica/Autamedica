/**
 * Frontend Service: Authenticated User profile.
 * Orchestrates API access through fetchApi.
 * Layer 3 of the 7-layer architecture.
 */
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'

export interface AuthenticatedUserProfile {
  id: string
  doctorProfileId?: string
  email: string
  role?: 'doctor' | 'patient' | 'company_admin' | 'platform_admin'
  createdAt?: string
  onboardingCompletedAt?: string | null
  profile?: {
    fullName?: string
    firstName?: string
    lastName?: string
    specialties?: string[]
    medicalLicense?: string
  }
}

export const authUserService = {
  async getCurrentUser(): Promise<AuthenticatedUserProfile | null> {
    try {
      return await fetchApi<AuthenticatedUserProfile | null>('/api/auth/me')
    } catch (error) {
      logger.error('[authUserService] getCurrentUser failed', error)
      throw error
    }
  },
}
