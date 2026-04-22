/**
 * Frontend Service: Authenticated User profile.
 * Orchestrates API access through fetchApi.
 * Includes in-memory cache to prevent rate limiting (429).
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
    phone?: string
    specialties?: string[]
    medicalLicense?: string
  }
}

let cachedUser: AuthenticatedUserProfile | null = null
let cachedAt = 0
let inflight: Promise<AuthenticatedUserProfile | null> | null = null
const CACHE_TTL_MS = 10_000 // 10 seconds

export const authUserService = {
  async getCurrentUser(): Promise<AuthenticatedUserProfile | null> {
    // Return cache if fresh
    if (cachedUser && Date.now() - cachedAt < CACHE_TTL_MS) {
      return cachedUser
    }

    // Deduplicate concurrent calls
    if (inflight) return inflight

    inflight = (async () => {
      try {
        const user = await fetchApi<AuthenticatedUserProfile | null>('/api/auth/me')
        cachedUser = user
        cachedAt = Date.now()
        return user
      } catch (error) {
        logger.error('[authUserService] getCurrentUser failed', error)
        // On 429, return stale cache instead of throwing
        if (cachedUser) return cachedUser
        throw error
      } finally {
        inflight = null
      }
    })()

    return inflight
  },

  invalidateCache() {
    cachedUser = null
    cachedAt = 0
  },
}
