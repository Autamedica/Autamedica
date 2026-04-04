/**
 * Browser-only storage operations for auth state.
 * Must only be called from client-side React components/hooks.
 *
 * Centralizes all sessionStorage access so that the domain service
 * (service.ts) stays platform-agnostic and safe for SSR/Edge.
 */

const MANUAL_SIGNOUT_KEY = 'au-manual-signout'

export function markManualSignout(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(MANUAL_SIGNOUT_KEY, '1')
  }
}

export function wasManualSignout(): boolean {
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(MANUAL_SIGNOUT_KEY) === '1'
  }
  return false
}

export function clearManualSignout(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(MANUAL_SIGNOUT_KEY)
  }
}
