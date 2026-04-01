/**
 * @fileoverview Main entry point for @autamedica/auth package
 * Centralized authentication for AutaMedica platform
 */

// Export types
export type {
  AppName, AuthErrorType, AuthState, DomainConfig, Environment, RedirectConfig,
  SessionConfig, UserMetadata, UserProfile, UserRole
} from './types'

export {
  APP_ALLOWED_ROLES,
  AuthError, ROLE_APP_MAPPING
} from './types'

// Export constants
export { APP_NAMES } from './constants'
export type { AppNameConstant } from './constants'

// Export roles utilities (source of truth for role/portal logic)
export {
  ROLES,
  PORTALS,
  ALL_ROLES,
  ROLE_TO_PORTAL,
  PORTAL_TO_ROLE,
  isUserRole,
  isPortal,
  getPortalForRole,
  getRoleForPortal,
  isAdminRole,
  isMedicalRole,
  canAccessPatientData,
  canManagePlatform,
  canAccessPortal,
  getBasePermissions,
  hasPermission,
  normalizeRole,
} from './roles'
export type { Portal } from './roles'

// Export client utilities
export {
  createBrowserClient,
  getSupabaseClient,
  resetAuthCircuitBreaker,
  signOutGlobally
} from './client/supabase'

// Export server utilities
export {
  createAdminClient,
  createServerClientFromRequest, createServerClientWithCookies
} from './server'
export type { CookieAdapter } from './server'

// Export hooks and context
export {
  AuthProvider,
  useAuth,
  useRequireAuth,
  useRequireRole
} from './hooks/useAuth'

export { useSupabase } from './hooks/useSupabase'

// Export configuration utilities
export {
  getDomainConfig, getEnvironment, getSessionConfig,
  getSupabaseConfig,
  isSameOrigin,
  sanitizeReturnUrl
} from './utils/config'

// Export redirect utilities
export {
  clearLastPath, getCorrectAppUrl, getDefaultRedirectUrl, getLastPath, getLoginUrl, getRedirectUrl, isCorrectAppForRole, storeLastPath
} from './utils/redirect'

// Export session utilities
export {
  getCurrentUser, getSession, hasPortalAccess, hasRole, RedirectError, requirePortalAccess, requireSession, signOut
} from './session'
