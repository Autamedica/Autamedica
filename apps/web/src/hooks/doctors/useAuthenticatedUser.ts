/**
 * Hook: Authenticated User UI State.
 * Consumes authUserService for profile data.
 * Manages auth state changes via Supabase auth listener (required for reactive sign-in/sign-out).
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@autamedica/auth'
import { logger } from '@autamedica/shared'
import { authUserService } from '@/lib/doctors/services/auth-user.service'
import type { AuthenticatedUserProfile } from '@/lib/doctors/services/auth-user.service'
import { clearManualSignout, wasManualSignout } from '@/lib/auth/browser-storage'

interface UseAuthenticatedUserReturn {
  user: AuthenticatedUserProfile | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
}

export function useAuthenticatedUser(): UseAuthenticatedUserReturn {
  if (import.meta.env.DEV && import.meta.env.PUBLIC_APP_URL?.includes('localhost')) {
    return {
      user: {
        id: "7fd7ae56-bdae-4a20-9057-71dfd74e3e28",
        doctorProfileId: "f99e8a6c-3bb2-4a21-967e-cacd261c3a4d",
        email: "bounced_dr.garcia@autamedica.com",
        role: "doctor",
        createdAt: "2026-04-29T16:51:57.095014+00:00",
        onboardingCompletedAt: "2026-05-24T09:17:38.019784+00:00",
        profile: {
          fullName: "Carlos Garcia",
          firstName: "Carlos",
          lastName: "Garcia",
          phone: "+541168261552",
          specialties: ["Medicina General"],
          medicalLicense: "MP-DEMO-12345"
        }
      },
      loading: false,
      error: null,
      refreshUser: async () => {}
    }
  }

  const [user, setUser] = useState<AuthenticatedUserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  const refreshUser = useCallback(async () => {
    if (!isClient) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const profile = await authUserService.getCurrentUser()
      setUser(profile)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error loading user'
      setError(errorMessage)
      logger.error('[useAuthenticatedUser] refreshUser error:', err)
    } finally {
      setLoading(false)
    }
  }, [isClient])

  useEffect(() => {
    if (!isClient) return

    void refreshUser()

    const supabase = createBrowserClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          try {
            const profile = await authUserService.getCurrentUser()
            setUser(profile)
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Error loading user'
            setError(errorMessage)
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setError(null)
          // If the user didn't trigger logout manually, redirect with expired flag
          if (!wasManualSignout()) {
            window.location.href = '/auth/login?expired=true'
          }
          clearManualSignout()
        }

        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [isClient, refreshUser])

  return { user, loading, error, refreshUser }
}
