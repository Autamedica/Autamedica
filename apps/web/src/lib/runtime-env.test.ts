import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  primeRuntimeEnv,
  getRuntimeEnvValue,
  resetRuntimeEnvCache,
  resolveCloudflareCallsEnv,
  resolvePublicClientEnv,
  resolveServiceRoleKey,
} from './runtime-env'

// Reset cache between tests by re-priming with empty
function resetCache() {
  resetRuntimeEnvCache()
}

describe('primeRuntimeEnv', () => {
  afterEach(resetCache)

  it('caches string values from runtime env', () => {
    primeRuntimeEnv({ GEMINI_API_KEY: 'test-key-123', OTHER: 'val' })
    expect(getRuntimeEnvValue('GEMINI_API_KEY')).toBe('test-key-123')
    expect(getRuntimeEnvValue('OTHER')).toBe('val')
  })

  it('ignores non-string values', () => {
    primeRuntimeEnv({ NUM: 42, BOOL: true, OBJ: { nested: 1 }, STR: 'ok' })
    expect(getRuntimeEnvValue('NUM')).toBeUndefined()
    expect(getRuntimeEnvValue('BOOL')).toBeUndefined()
    expect(getRuntimeEnvValue('OBJ')).toBeUndefined()
    expect(getRuntimeEnvValue('STR')).toBe('ok')
  })

  it('ignores empty strings', () => {
    primeRuntimeEnv({ EMPTY: '', SPACE: '  ' })
    expect(getRuntimeEnvValue('EMPTY')).toBeUndefined()
    // Note: ' ' (whitespace) IS a non-empty string, so it gets cached
    expect(getRuntimeEnvValue('SPACE')).toBe('  ')
  })

  it('no-ops when called with undefined', () => {
    primeRuntimeEnv({ KEY: 'before' })
    primeRuntimeEnv(undefined)
    expect(getRuntimeEnvValue('KEY')).toBe('before')
  })

  it('no-ops when called with null', () => {
    primeRuntimeEnv({ KEY: 'before' })
    primeRuntimeEnv(null)
    expect(getRuntimeEnvValue('KEY')).toBe('before')
  })

  it('merges new values without losing old ones', () => {
    primeRuntimeEnv({ A: '1' })
    primeRuntimeEnv({ B: '2' })
    expect(getRuntimeEnvValue('A')).toBe('1')
    expect(getRuntimeEnvValue('B')).toBe('2')
  })

  it('overwrites existing values with newer ones', () => {
    primeRuntimeEnv({ KEY: 'old' })
    primeRuntimeEnv({ KEY: 'new' })
    expect(getRuntimeEnvValue('KEY')).toBe('new')
  })
})

describe('getRuntimeEnvValue', () => {
  afterEach(resetCache)

  it('returns undefined for non-existent keys', () => {
    expect(getRuntimeEnvValue('DOES_NOT_EXIST')).toBeUndefined()
  })

  it('returns undefined for empty string values (falsy check)', () => {
    // getRuntimeEnvValue uses `||` not `??`, so empty string → undefined
    primeRuntimeEnv({ EMPTY: '' })
    expect(getRuntimeEnvValue('EMPTY')).toBeUndefined()
  })
})

describe('resolvePublicClientEnv', () => {
  afterEach(resetCache)

  it('returns values from runtime env when provided', () => {
    // Without any env configured, readProcess throws for PUBLIC_ vars.
    // This is correct behavior — resolvePublicClientEnv requires at least
    // one source to be configured. Test with explicit values instead.
    const result = resolvePublicClientEnv({
      PUBLIC_SUPABASE_URL: 'https://provided.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'provided-key',
      PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    })
    expect(result.publicSupabaseUrl).toBe('https://provided.supabase.co')
    expect(result.publicSupabaseAnonKey).toBe('provided-key')
    expect(result.publicSentryDsn).toBe('https://public@example.ingest.sentry.io/1')
  })

  it('resolves from runtime env parameter', () => {
    const result = resolvePublicClientEnv({
      PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-key-123',
      PUBLIC_SENTRY_DSN: 'https://dsn@example.ingest.sentry.io/1',
    })
    expect(result.publicSupabaseUrl).toBe('https://test.supabase.co')
    expect(result.publicSupabaseAnonKey).toBe('anon-key-123')
    expect(result.publicSentryDsn).toBe('https://dsn@example.ingest.sentry.io/1')
  })

  it('resolves NEXT_PUBLIC_ prefix variants', () => {
    const result = resolvePublicClientEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://next.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'next-anon',
    })
    expect(result.publicSupabaseUrl).toBe('https://next.supabase.co')
    expect(result.publicSupabaseAnonKey).toBe('next-anon')
  })

  it('prefers direct runtime env over cached', () => {
    primeRuntimeEnv({ PUBLIC_SUPABASE_URL: 'cached-url' })
    const result = resolvePublicClientEnv({ PUBLIC_SUPABASE_URL: 'direct-url' })
    expect(result.publicSupabaseUrl).toBe('direct-url')
  })

  it('resolves sentry dsn from cached runtime env', () => {
    primeRuntimeEnv({ PUBLIC_SENTRY_DSN: 'cached-dsn' })
    const result = resolvePublicClientEnv({ PUBLIC_SUPABASE_URL: 'direct-url', PUBLIC_SUPABASE_ANON_KEY: 'key' })
    expect(result.publicSentryDsn).toBe('cached-dsn')
  })

  it('resolves NEXT_PUBLIC sentry dsn variants', () => {
    const result = resolvePublicClientEnv({
      PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-key-123',
      NEXT_PUBLIC_SENTRY_DSN: 'https://next-public-dsn@example.ingest.sentry.io/1',
    })
    expect(result.publicSentryDsn).toBe('https://next-public-dsn@example.ingest.sentry.io/1')
  })
})

describe('resolveServiceRoleKey', () => {
  afterEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    resetCache()
  })

  it('reads service role key from runtime env', () => {
    const result = resolveServiceRoleKey({
      SUPABASE_SERVICE_ROLE_KEY: 'runtime-service-role',
    })

    expect(result).toBe('runtime-service-role')
  })

  it('falls back to cached runtime env values', () => {
    primeRuntimeEnv({
      SUPABASE_SERVICE_ROLE_KEY: 'cached-service-role',
    })

    expect(resolveServiceRoleKey()).toBe('cached-service-role')
  })

  it('falls back to process env values when runtime env is not present', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'process-service-role')

    expect(resolveServiceRoleKey()).toBe('process-service-role')
  })
})

describe('resolveCloudflareCallsEnv', () => {
  afterEach(() => {
    vi.stubEnv('CLOUDFLARE_CALLS_APP_ID', '')
    vi.stubEnv('CLOUDFLARE_CALLS_APP_SECRET', '')
    resetCache()
  })

  it('reads Cloudflare Calls credentials from runtime env', () => {
    const result = resolveCloudflareCallsEnv({
      CLOUDFLARE_CALLS_APP_ID: 'runtime-app-id',
      CLOUDFLARE_CALLS_APP_SECRET: 'runtime-app-secret',
    })

    expect(result).toEqual({
      appId: 'runtime-app-id',
      appSecret: 'runtime-app-secret',
    })
  })

  it('falls back to cached runtime env values', () => {
    primeRuntimeEnv({
      CLOUDFLARE_CALLS_APP_ID: 'cached-app-id',
      CLOUDFLARE_CALLS_APP_SECRET: 'cached-app-secret',
    })

    const result = resolveCloudflareCallsEnv()

    expect(result).toEqual({
      appId: 'cached-app-id',
      appSecret: 'cached-app-secret',
    })
  })

  it('falls back to import meta env values when runtime env is not present', () => {
    vi.stubEnv('CLOUDFLARE_CALLS_APP_ID', 'build-app-id')
    vi.stubEnv('CLOUDFLARE_CALLS_APP_SECRET', 'build-app-secret')

    const result = resolveCloudflareCallsEnv()

    expect(result).toEqual({
      appId: 'build-app-id',
      appSecret: 'build-app-secret',
    })
  })
})
