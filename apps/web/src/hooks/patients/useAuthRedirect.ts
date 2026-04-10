import { useCallback, useEffect, useRef } from 'react'

/**
 * Redirects to the patient login page when auth is required.
 * Guards against double-redirects with a ref.
 */
export function useAuthRedirect(authRequired: boolean, returnPath: string): void {
  const startedRef = useRef(false)

  const redirect = useCallback(() => {
    if (typeof window === 'undefined' || startedRef.current) return
    startedRef.current = true

    const authOrigin = window.location.origin
    const loginUrl = new URL('/auth/login', authOrigin)
    loginUrl.searchParams.set('portal', 'patients')
    loginUrl.searchParams.set('returnTo', `${window.location.origin}${returnPath}`)
    window.location.replace(loginUrl.toString())
  }, [returnPath])

  useEffect(() => {
    if (authRequired) redirect()
  }, [authRequired, redirect])
}
