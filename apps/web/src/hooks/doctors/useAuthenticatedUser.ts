'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@autamedica/auth/client'
import { logger } from '@autamedica/shared'

interface AuthenticatedUser {
  id: string
  email: string
  role?: 'doctor' | 'patient' | 'company_admin' | 'platform_admin'
  created_at?: string
  onboarding_completed_at?: string | null
  profile?: {
    full_name?: string
    first_name?: string
    last_name?: string
    specialties?: string[]
    medical_license?: string
  }
}

interface UseAuthenticatedUserReturn {
  user: AuthenticatedUser | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
}

export function useAuthenticatedUser(): UseAuthenticatedUserReturn {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Initialize client safely after hydration
  useEffect(() => {
    setIsClient(true)
  }, [])

  const supabase = isClient ? createBrowserClient() : null

  const fetchUserProfile = async (userId: string, userEmail: string) => {
    if (!supabase) return null

    try {
      // Get user from auth.users
      const { data: authUser } = await supabase.auth.getUser()

      if (!authUser.user) {
        throw new Error('No authenticated user found')
      }

      // Get role from user_metadata or app_metadata
      const role = authUser.user.user_metadata?.role ||
                  authUser.user.app_metadata?.role

      // Try to get profile from public.profiles table
      // profiles PK is user_id, not id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (profileError && profileError.code !== 'PGRST116') {
        logger.warn('Error fetching profile:', profileError.message)
      }

      // Map DB profile (null values) to AuthenticatedUser profile (undefined values)
      const profileData: AuthenticatedUser['profile'] = profile
        ? {
            full_name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || undefined,
            first_name: profile.first_name ?? undefined,
            last_name: profile.last_name ?? undefined,
            specialties: authUser.user.user_metadata?.specialties,
            medical_license: authUser.user.user_metadata?.medical_license
          }
        : {
            full_name: authUser.user.user_metadata?.full_name,
            first_name: authUser.user.user_metadata?.first_name,
            last_name: authUser.user.user_metadata?.last_name,
            specialties: authUser.user.user_metadata?.specialties,
            medical_license: authUser.user.user_metadata?.medical_license
          }

      const authenticatedUser: AuthenticatedUser = {
        id: userId,
        email: userEmail,
        role: typeof role === 'string' ? role as AuthenticatedUser['role'] : undefined,
        created_at: profile?.created_at ?? undefined,
        onboarding_completed_at: profile?.onboarding_completed_at ?? null,
        profile: profileData
      }

      return authenticatedUser

    } catch (err) {
      logger.error('Error fetching user profile:', err)
      throw err
    }
  }

  const refreshUser = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        setUser(null)
        return
      }

      const userProfile = await fetchUserProfile(authUser.id, authUser.email ?? '')
      setUser(userProfile)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error loading user'
      setError(errorMessage)
      logger.error('Error in refreshUser:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!supabase) return

    refreshUser()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            try {
              const userProfile = await fetchUserProfile(session.user.id, session.user.email ?? '')
              setUser(userProfile)
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Error loading user'
              setError(errorMessage)
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setError(null)
        }

        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  return {
    user,
    loading,
    error,
    refreshUser
  }
}
