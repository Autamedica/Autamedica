/**
 * @fileoverview Environment-aware configuration for authentication
 */

import type { DomainConfig, Environment, SessionConfig } from '../types'

/**
 * Get the current environment
 */
export function getEnvironment(): Environment {
  const env = process.env.PUBLIC_NODE_ENV || process.env.NODE_ENV || 'development'

  if (env === 'production') return 'production'
  if (env === 'staging') return 'staging'
  return 'development'
}

/**
 * Get domain configuration for the current environment
 */
export function getDomainConfig(): DomainConfig {
  const env = getEnvironment()

  const configs: Record<Environment, DomainConfig> = {
    production: {
      base: 'autamedica.com',
      cookie: process.env.AUTH_COOKIE_DOMAIN || '.autamedica.com',
      apps: {
        web: 'https://www.autamedica.com',
        auth: 'https://www.autamedica.com',
        patients: 'https://patients.autamedica.com',
        doctors: 'https://doctors.autamedica.com',
        companies: 'https://companies.autamedica.com',
        admin: 'https://admin.autamedica.com'
      }
    },
    staging: {
      base: 'pages.dev',
      cookie: '.pages.dev',
      apps: {
        web: 'https://autamedica-web-app-staging.pages.dev',
        auth: 'https://autamedica-web-app-staging.pages.dev',
        patients: 'https://autamedica-patients-staging.pages.dev',
        doctors: 'https://autamedica-doctors-staging.pages.dev',
        companies: 'https://autamedica-companies-staging.pages.dev',
        admin: 'https://autamedica-admin-staging.pages.dev'
      }
    },
    development: {
      base: 'localhost',
      cookie: 'localhost',
      apps: {
        web: 'http://localhost:3000',
        auth: 'http://localhost:3000',
        patients: 'http://localhost:3003',
        doctors: 'http://localhost:3002',
        companies: 'http://localhost:3004',
        admin: 'http://localhost:3006'
      }
    }
  }

  return configs[env]
}

/**
 * Get session configuration
 */
export function getSessionConfig(): SessionConfig {
  const domain = getDomainConfig()

  return {
    cookieName: 'autamedica_session',
    cookieDomain: domain.cookie,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    refreshThreshold: 60 * 60, // Refresh when less than 1 hour remains
    rememberMeDuration: 90 * 24 * 60 * 60 // 90 days for "remember me"
  }
}

/**
 * Resolve an env var across multiple sources.
 * In browser bundles built by Vite/Astro, `process.env` is often undefined
 * because only `import.meta.env.PUBLIC_*` gets replaced at build time —
 * but that replacement only works inside the app, not in pre-compiled packages.
 * We also try `NEXT_PUBLIC_*` aliases for backwards compat with the shared pkg.
 */
function resolveEnv(name: string): string | undefined {
  // 1. process.env (Node / Vite define replacements inside the app)
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name]
  }

  // 2. Browser: env vars injected on window by the host app
  if (typeof window !== 'undefined') {
    const win = window as unknown as Record<string, unknown>
    // window.__ENV.PUBLIC_SUPABASE_URL pattern
    const envBag = win.__ENV as Record<string, string> | undefined
    if (envBag?.[name]) return envBag[name]
  }

  // 3. NEXT_PUBLIC_ alias (used by @autamedica/shared compat layer)
  const nextName = name.replace(/^PUBLIC_/, 'NEXT_PUBLIC_')
  if (typeof process !== 'undefined' && process.env?.[nextName]) {
    return process.env[nextName]
  }

  return undefined
}

/**
 * Get Supabase configuration
 */
export function getSupabaseConfig() {
  const env = getEnvironment()

  const url = resolveEnv('PUBLIC_SUPABASE_URL')
  const anonKey = resolveEnv('PUBLIC_SUPABASE_ANON_KEY')

  // Validate configuration - NO FALLBACKS for security
  if (!url || !anonKey) {
    throw new Error('Supabase configuration is missing. Please set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY')
  }

  // Development localhost override if needed
  if (env === 'development' && url.includes('localhost:54321')) {
    return {
      url: 'http://localhost:54321',
      anonKey: anonKey
    }
  }

  return { url, anonKey }
}

/**
 * Check if a URL is same-origin
 */
export function isSameOrigin(url: string): boolean {
  try {
    const domain = getDomainConfig()
    const urlObj = new URL(url, typeof window !== 'undefined' ? window.location.href : domain.apps.web)

    // Check if the URL belongs to any of our apps
    const validOrigins = Object.values(domain.apps)
    return validOrigins.some(origin => {
      const originUrl = new URL(origin)
      return urlObj.hostname === originUrl.hostname
    })
  } catch {
    return false
  }
}

/**
 * Sanitize return URL to prevent open redirects
 */
export function sanitizeReturnUrl(url: string | null | undefined): string | null {
  if (!url) return null

  // Remove any potential XSS attempts
  const cleaned = url.replace(/[<>'"]/g, '')

  // Ensure it's a relative URL or same-origin absolute URL
  if (cleaned.startsWith('/')) {
    return cleaned
  }

  if (isSameOrigin(cleaned)) {
    return cleaned
  }

  return null
}