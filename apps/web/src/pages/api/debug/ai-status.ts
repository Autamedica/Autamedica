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
  primeRuntimeEnv((locals as Record<string, unknown>).runtime?.env as Record<string, string> | undefined)

  const target = resolveExtractionTarget()
  const geminiKey = resolveServerEnv('GEMINI_API_KEY')
  const openaiKey = resolveServerEnv('OPENAI_API_KEY')

  return new Response(JSON.stringify({
    configured: isAnamnesisExtractionConfigured(),
    target: target ? { provider: target.providerName, model: target.modelName } : null,
    hasGeminiKey: Boolean(geminiKey),
    geminiKeyPrefix: geminiKey ? geminiKey.substring(0, 8) + '...' : null,
    hasOpenaiKey: Boolean(openaiKey),
    runtimeEnvAvailable: Boolean((locals as Record<string, unknown>).runtime?.env),
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
