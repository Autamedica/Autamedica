import { getServerEnvOrDefault } from '@autamedica/shared'
import { getRuntimeEnvValue } from '@/lib/runtime-env'

const DEFAULT_MODEL = 'gemini-3.1-flash-preview'

export type ExtractionProvider = 'gemini'

export interface ExtractionTarget {
  providerName: ExtractionProvider
  modelName: string
}

/**
 * Resolve server env var — works in both Node (process.env) and Cloudflare Workers (import.meta.env).
 * Cloudflare Pages secrets are exposed via import.meta.env at runtime in Astro SSR.
 */
export function resolveServerEnv(name: string): string | undefined {
  // 1. Cloudflare runtime cache (primed by middleware from context.locals.runtime.env)
  const cached = getRuntimeEnvValue(name)
  if (cached) return cached

  // 2. Astro / Vite — import.meta.env
  try {
    const metaVal = (import.meta as unknown as { env: Record<string, string> }).env?.[name]
    if (metaVal) return metaVal
  } catch { /* not available */ }

  // 3. Node / fallback — process.env
  try {
    return getServerEnvOrDefault(name)
  } catch { /* not available */ }

  return undefined
}

export function hasGeminiKey(): boolean {
  return Boolean(resolveServerEnv('GEMINI_API_KEY'))
}

export function resolveExtractionTarget(): ExtractionTarget | null {
  if (!hasGeminiKey()) return null

  return {
    providerName: 'gemini',
    modelName:
      resolveServerEnv('ANAMNESIS_AI_GEMINI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
      DEFAULT_MODEL,
  }
}

export function isAnamnesisExtractionConfigured(): boolean {
  return resolveExtractionTarget() !== null
}

export function getAnamnesisExtractionProviderName(): ExtractionProvider | null {
  return resolveExtractionTarget()?.providerName ?? null
}

export function getAnamnesisExtractionModelName(): string {
  return resolveExtractionTarget()?.modelName ?? DEFAULT_MODEL
}
