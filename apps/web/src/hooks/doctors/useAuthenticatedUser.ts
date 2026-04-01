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

interface UseAuthenticatedUserReturn {
  user: AuthenticatedUserProfile | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
}

export function useAuthenticatedUser(): UseAuthenticatedUserReturn {
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
          if (!sessionStorage.getItem('au-manual-signout')) {
            window.location.href = '/auth/login?expired=true'
          }
          sessionStorage.removeItem('au-manual-signout')
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
