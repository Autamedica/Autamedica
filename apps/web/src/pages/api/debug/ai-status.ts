/**
 * DEBUG ENDPOINT — temporary, remove after fixing AI integration.
 * Returns whether AI extraction is configured and which provider is active.
 */
import type { APIRoute } from 'astro'
import { primeRuntimeEnv } from '@/lib/runtime-env'
import {
  isAnamnesisExtractionConfigured,
  resolveExtractionTarget,
  resolveServerEnv,
} from '@/lib/patients/server/ai-provider'

export const GET: APIRoute = async ({ locals }) => {
  // Prime runtime env from Cloudflare
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtimeEnv = (locals as any).runtime?.env as Record<string, string> | undefined
  primeRuntimeEnv(runtimeEnv)

  const target = resolveExtractionTarget()
  const geminiKey = resolveServerEnv('GEMINI_API_KEY')
  const openaiKey = resolveServerEnv('OPENAI_API_KEY')

  return new Response(JSON.stringify({
    configured: isAnamnesisExtractionConfigured(),
    target: target ? { provider: target.providerName, model: target.modelName } : null,
    hasGeminiKey: Boolean(geminiKey),
    geminiKeyPrefix: geminiKey ? geminiKey.substring(0, 8) + '...' : null,
    hasOpenaiKey: Boolean(openaiKey),
    runtimeEnvAvailable: Boolean(runtimeEnv),
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
