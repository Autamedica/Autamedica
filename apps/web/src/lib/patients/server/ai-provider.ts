import { getServerEnvOrDefault } from '@autamedica/shared'

const DEFAULT_OPENAI_MODEL = 'gpt-5.4-2026-03-05'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'

export type ExtractionProvider = 'openai' | 'gemini'
type ExtractionProviderPreference = ExtractionProvider | 'auto'

export interface ExtractionTarget {
  providerName: ExtractionProvider
  modelName: string
}

export function normalizeProviderPreference(value: string | null | undefined): ExtractionProviderPreference {
  if (value === 'openai' || value === 'gemini') {
    return value
  }

  return 'auto'
}

/**
 * Resolve server env var — works in both Node (process.env) and Cloudflare Workers (import.meta.env).
 * Cloudflare Pages secrets are exposed via import.meta.env at runtime in Astro SSR.
 */
export function resolveServerEnv(name: string): string | undefined {
  // 1. Astro / Vite — import.meta.env (works in Cloudflare Pages)
  try {
    const metaVal = (import.meta as unknown as { env: Record<string, string> }).env?.[name]
    if (metaVal) return metaVal
  } catch { /* not available */ }

  // 2. Node / fallback — process.env
  try {
    return getServerEnvOrDefault(name)
  } catch { /* not available */ }

  return undefined
}

export function hasOpenAiKey(): boolean {
  return Boolean(resolveServerEnv('OPENAI_API_KEY'))
}

export function hasGeminiKey(): boolean {
  return Boolean(resolveServerEnv('GEMINI_API_KEY'))
}

export function resolveExtractionTarget(): ExtractionTarget | null {
  const preferredProvider = normalizeProviderPreference(
    resolveServerEnv('ANAMNESIS_AI_PROVIDER') ?? resolveServerEnv('PATIENT_AI_PROVIDER'),
  )

  if (preferredProvider === 'openai') {
    return hasOpenAiKey()
      ? {
          providerName: 'openai',
          modelName:
            resolveServerEnv('ANAMNESIS_AI_OPENAI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
            DEFAULT_OPENAI_MODEL,
        }
      : null
  }

  if (preferredProvider === 'gemini') {
    return hasGeminiKey()
      ? {
          providerName: 'gemini',
          modelName:
            resolveServerEnv('ANAMNESIS_AI_GEMINI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
            DEFAULT_GEMINI_MODEL,
        }
      : null
  }

  if (hasOpenAiKey()) {
    return {
      providerName: 'openai',
      modelName:
        resolveServerEnv('ANAMNESIS_AI_OPENAI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
        DEFAULT_OPENAI_MODEL,
    }
  }

  if (hasGeminiKey()) {
    return {
      providerName: 'gemini',
      modelName:
        resolveServerEnv('ANAMNESIS_AI_GEMINI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
        DEFAULT_GEMINI_MODEL,
    }
  }

  return null
}

export function isAnamnesisExtractionConfigured(): boolean {
  return resolveExtractionTarget() !== null
}

export function getAnamnesisExtractionProviderName(): ExtractionProvider | null {
  return resolveExtractionTarget()?.providerName ?? null
}

export function getAnamnesisExtractionModelName(): string {
  return resolveExtractionTarget()?.modelName ?? DEFAULT_OPENAI_MODEL
}
