'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { SessionData, fetchSessionData, getLoginUrl } from '@/lib/session-sync'
import { logger } from '@autamedica/shared'

/** Routes that should never trigger auth redirects */
const PUBLIC_PATHS = ['/test-call', '/consultation', '/auth/callback']

function isPublicPath(): boolean {
  if (typeof window === 'undefined') return false
  return PUBLIC_PATHS.some(p => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`))
}

/** Guard: prevent multiple redirect navigations */
let _redirecting = false

function redirectToLogin(): void {
  if (_redirecting || isPublicPath()) return
  if (process.env.NODE_ENV === 'development') return
  _redirecting = true
  window.location.href = getLoginUrl()
}

interface AuthContextType {
  session: SessionData | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
  initialSession?: SessionData | null
}

export function AuthProvider({ children, initialSession = null }: AuthProviderProps) {
  const [session, setSession] = useState<SessionData | null>(initialSession)
  const [loading, setLoading] = useState(!initialSession)
  const [error, setError] = useState<string | null>(null)
  const refreshingRef = useRef(false)

  const refresh = async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true

    try {
      setLoading(true)
      setError(null)

      const sessionData = await fetchSessionData()

      if (!sessionData) {
        redirectToLogin()
        return
      }

      setSession(sessionData)
    } catch (err) {
      logger.error('Auth refresh error:', err)
      setError(err instanceof Error ? err.message : 'Authentication failed')
      redirectToLogin()
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }

  // Auto-refresh on mount if no initial session
  useEffect(() => {
    if (!initialSession) {
      refresh()
    } else {
      setLoading(false)
    }
  }, [initialSession])

  // Auto-refresh before token expires
  useEffect(() => {
    if (!session?.session.expires_at) return

    const now = Math.floor(Date.now() / 1000)
    const expiresIn = session.session.expires_at - now
    const refreshTime = Math.max(expiresIn - 300, 60) // Refresh 5 min before expiry, min 1 min

    const timer = setTimeout(refresh, refreshTime * 1000)

    return () => clearTimeout(timer)
  }, [session])

  return (
    <AuthContext.Provider value={{ session, loading, error, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useRequireAuth() {
  const { session, loading, error } = useAuth()

  if (loading) {
    return { session: null, loading: true, error: null }
  }

  if (!session || error) {
    redirectToLogin()
    return { session: null, loading: false, error: error || 'No session' }
  }

  return { session, loading: false, error: null }
}