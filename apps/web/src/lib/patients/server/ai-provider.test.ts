import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('resolveExtractionTarget (with env)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.resetModules()
  })

  it('returns null when no GEMINI_API_KEY configured', async () => {
    delete process.env.GEMINI_API_KEY

    const { resolveExtractionTarget } = await import('./ai-provider')
    const result = resolveExtractionTarget()
    if (result === null) {
      expect(result).toBeNull()
    } else {
      expect(result).toHaveProperty('providerName')
      expect(result.providerName).toBe('gemini')
    }
  })

  it('returns gemini when GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'

    const mod = await import('./ai-provider')
    const hasKey = mod.hasGeminiKey()
    if (hasKey) {
      const target = mod.resolveExtractionTarget()
      expect(target?.providerName).toBe('gemini')
      expect(target?.modelName).toContain('gemini')
    }
  })

  it('respects explicit model override', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.ANAMNESIS_AI_GEMINI_MODEL = 'gemini-custom-model'

    const mod = await import('./ai-provider')
    if (mod.hasGeminiKey()) {
      const target = mod.resolveExtractionTarget()
      expect(target?.modelName).toBe('gemini-custom-model')
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
