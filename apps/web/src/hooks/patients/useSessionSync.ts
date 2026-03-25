/**
 * Hook: handles session synchronization from URL tokens in dev.
 * In localhost, cookies don't work across different ports, so tokens are passed via URL.
 * Extracted from SessionSync.tsx to keep components free of auth logic.
 */
import { useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export function useSessionSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const urlParams = new URLSearchParams(window.location.search)
    const accessToken = urlParams.get('access_token')
    const refreshToken = urlParams.get('refresh_token')

    if (accessToken || refreshToken) {
      urlParams.delete('access_token')
      urlParams.delete('refresh_token')
      const cleanUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '')
      window.history.replaceState({}, '', cleanUrl)
    }

    if (accessToken && refreshToken && JWT_PATTERN.test(accessToken) && JWT_PATTERN.test(refreshToken)) {
      const supabase = createBrowserClient(
        import.meta.env.PUBLIC_SUPABASE_URL,
        import.meta.env.PUBLIC_SUPABASE_ANON_KEY
      )

      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
    }
  }, [])
}
