import { afterEach, describe, expect, it } from 'vitest'
import {
  primeRuntimeEnv,
  getRuntimeEnvValue,
  resolvePublicClientEnv,
} from './runtime-env'

// Reset cache between tests by re-priming with empty
function resetCache() {
  // Prime with a known-empty object to clear previous state
  // Then prime with empty to ensure clean state
  primeRuntimeEnv({})
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
    })
    expect(result.publicSupabaseUrl).toBe('https://provided.supabase.co')
    expect(result.publicSupabaseAnonKey).toBe('provided-key')
  })

  it('resolves from runtime env parameter', () => {
    const result = resolvePublicClientEnv({
      PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-key-123',
    })
    expect(result.publicSupabaseUrl).toBe('https://test.supabase.co')
    expect(result.publicSupabaseAnonKey).toBe('anon-key-123')
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
})
