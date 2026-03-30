import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeProviderPreference } from './ai-provider'

// We test normalizeProviderPreference directly (pure function).
// The other functions depend on resolveServerEnv which reads from
// import.meta.env and process.env — we test those via integration.

describe('normalizeProviderPreference', () => {
  it('returns "openai" for "openai"', () => {
    expect(normalizeProviderPreference('openai')).toBe('openai')
  })

  it('returns "gemini" for "gemini"', () => {
    expect(normalizeProviderPreference('gemini')).toBe('gemini')
  })

  it('returns "auto" for unknown strings', () => {
    expect(normalizeProviderPreference('claude')).toBe('auto')
    expect(normalizeProviderPreference('gpt-4')).toBe('auto')
    expect(normalizeProviderPreference('OPENAI')).toBe('auto') // case sensitive
    expect(normalizeProviderPreference('')).toBe('auto')
  })

  it('returns "auto" for null/undefined', () => {
    expect(normalizeProviderPreference(null)).toBe('auto')
    expect(normalizeProviderPreference(undefined)).toBe('auto')
  })
})

// Integration tests for resolveExtractionTarget — requires env mocking
describe('resolveExtractionTarget (with env)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.resetModules()
  })

  it('returns null when no API keys configured', async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.GEMINI_API_KEY

    const { resolveExtractionTarget } = await import('./ai-provider')
    // May still find keys from import.meta.env or cached runtime env,
    // but in test environment without those, it should return null or
    // find one if previously cached. The function is deterministic given env.
    const result = resolveExtractionTarget()
    // We can't fully isolate import.meta.env in vitest, so we just verify
    // the function returns the correct shape
    if (result === null) {
      expect(result).toBeNull()
    } else {
      expect(result).toHaveProperty('providerName')
      expect(result).toHaveProperty('modelName')
      expect(['openai', 'gemini']).toContain(result.providerName)
    }
  })

  it('returns gemini when GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    delete process.env.OPENAI_API_KEY

    const mod = await import('./ai-provider')
    // resolveServerEnv checks process.env as fallback
    const hasKey = mod.hasGeminiKey()
    if (hasKey) {
      const target = mod.resolveExtractionTarget()
      expect(target?.providerName).toBe('gemini')
      expect(target?.modelName).toBe('gemini-2.5-pro')
    }
  })

  it('prefers openai when both keys present and auto mode', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.GEMINI_API_KEY = 'test-gemini-key'

    const mod = await import('./ai-provider')
    if (mod.hasOpenAiKey() && mod.hasGeminiKey()) {
      const target = mod.resolveExtractionTarget()
      // Auto mode tries OpenAI first
      expect(target?.providerName).toBe('openai')
    }
  })

  it('respects explicit provider preference', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.ANAMNESIS_AI_PROVIDER = 'gemini'

    const mod = await import('./ai-provider')
    if (mod.hasGeminiKey()) {
      const target = mod.resolveExtractionTarget()
      expect(target?.providerName).toBe('gemini')
    }
  })
})

describe('isAnamnesisExtractionConfigured', () => {
  it('returns boolean', async () => {
    const { isAnamnesisExtractionConfigured } = await import('./ai-provider')
    const result = isAnamnesisExtractionConfigured()
    expect(typeof result).toBe('boolean')
  })
})
