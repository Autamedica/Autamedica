'use client'

import { createBrowserClient } from '@autamedica/auth/client'
import type { UserRole } from '@autamedica/auth'
import { logger } from '@autamedica/shared'
import type { Session, User } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'

interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
  profile?: {
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

const FALLBACK_ROLE: UserRole = 'doctor'

function normalizeRole(value: unknown): UserRole {
  if (typeof value !== 'string') {
    return FALLBACK_ROLE
  }

  switch (value) {
    case 'doctor':
    case 'patient':
    case 'company':
    case 'company_admin':
    case 'organization_admin':
    case 'admin':
    case 'platform_admin':
      return value
    default:
      return FALLBACK_ROLE
  }
}

export function useAuthenticatedUser(): UseAuthenticatedUserReturn {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const initRef = useRef(false)

  // Build AuthenticatedUser from a Supabase User + optional DB profile
  const buildUser = useCallback(async (authUser: User): Promise<AuthenticatedUser> => {
    const supabase = supabaseRef.current
    if (!supabase) {
      throw new Error('Supabase client is not initialized')
    }

    const role = normalizeRole(authUser.user_metadata?.role ?? authUser.app_metadata?.role)
    const email = authUser.email
    if (!email) {
      throw new Error('Authenticated user is missing an email')
    }

    // Try to get profile from public.profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (profileError && profileError.code !== 'PGRST116') {
      logger.warn('Profile lookup returned non-404 error:', profileError.message)
    }

    return {
      id: authUser.id,
      email,
      role,
      profile: profile ? {
        first_name: profile.first_name ?? undefined,
        last_name: profile.last_name ?? undefined,
        specialties: authUser.user_metadata?.specialties,
        medical_license: authUser.user_metadata?.medical_license,
      } : {
        first_name: authUser.user_metadata?.first_name,
        last_name: authUser.user_metadata?.last_name,
        specialties: authUser.user_metadata?.specialties,
        medical_license: authUser.user_metadata?.medical_license,
      },
    }
  }, [])

  // Load user from session (no lock, no network call for auth)
  const loadFromSession = useCallback(async (session: Session | null): Promise<void> => {
    if (!session?.user) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      setError(null)
      const userProfile = await buildUser(session.user)
      setUser(userProfile)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error loading user'
      setError(msg)
      logger.warn('Could not build user profile:', msg)
    } finally {
      setLoading(false)
    }
  }, [buildUser])

  const refreshUser = useCallback(async (): Promise<void> => {
    const supabase = supabaseRef.current
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      // Use getSession (reads from cookies/storage, no lock contention)
      const { data: { session } } = await supabase.auth.getSession()
      await loadFromSession(session)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error loading user'
      setError(msg)
      setLoading(false)
    }
  }, [loadFromSession])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const supabase = createBrowserClient()
    supabaseRef.current = supabase

    // Initial load — use getSession (no lock, reads from cookies)
    supabase.auth.getSession().then(({ data: { session } }) => {
      loadFromSession(session)
    }).catch(() => {
      setLoading(false)
    })

    // Listen for auth state changes (token refresh, sign-in, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await loadFromSession(session)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setError(null)
          setLoading(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [loadFromSession])

  return {
    user,
    loading,
    error,
    refreshUser,
  }
}
