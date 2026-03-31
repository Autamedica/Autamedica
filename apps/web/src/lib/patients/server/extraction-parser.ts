import { AnamnesisExtractionResultSchema } from '@/lib/patients/lib/zod/anamnesis-extraction'
import type { AnamnesisExtractionResult } from '@/lib/patients/types/anamnesis-extraction'
import { logger } from '@autamedica/shared'
import type { Json } from '@autamedica/types'
/** Provider label for logging — accepts any string for backwards compat with stored data */
type ParserProviderLabel = string

export function isJsonObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseStructuredExtractionPayload(
  rawPayload: string,
  providerName: ParserProviderLabel,
): AnamnesisExtractionResult {
  let parsedPayload: unknown

  try {
    parsedPayload = JSON.parse(rawPayload)
  } catch (error) {
    logger.error(`[extract ${providerName}] Invalid JSON payload`, {
      error,
      rawPayload,
    })
    throw new Error('La salida del modelo no fue JSON valido')
  }

  const validation = AnamnesisExtractionResultSchema.safeParse(parsedPayload)
  if (!validation.success) {
    const issues = validation.error.issues.slice(0, 5).map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    }))

    logger.error(`[extract ${providerName}] Structured output validation FAILED`, { issues })

    // For medical data: reject invalid output, don't silently pass it through.
    // The caller will catch this and show an appropriate message to the patient.
    throw new Error(
      `Validación de datos fallida: ${issues.map(i => `${i.path}: ${i.message}`).join('; ')}`,
    )
  }

  return validation.data as AnamnesisExtractionResult
}

export function extractOpenAiStructuredOutput(payload: Record<string, unknown>): AnamnesisExtractionResult {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return parseStructuredExtractionPayload(payload.output_text, 'openai')
  }

  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const message = item as Record<string, unknown>
    const content = Array.isArray(message.content) ? message.content : []
    for (const entry of content) {
      if (!entry || typeof entry !== 'object') {
        continue
      }

      const record = entry as Record<string, unknown>
      if (
        (record.type === 'output_text' || record.type === 'text') &&
        typeof record.text === 'string' &&
        record.text.trim()
      ) {
        return parseStructuredExtractionPayload(record.text, 'openai')
      }
    }
  }

  throw new Error('La respuesta del modelo no incluyo contenido estructurado')
}

export function extractGeminiStructuredOutput(payload: Record<string, unknown>): AnamnesisExtractionResult {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  const usageMetadata = payload.usageMetadata as Record<string, unknown> | undefined

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }

    const candidateRecord = candidate as Record<string, unknown>
    const content =
      candidateRecord.content && typeof candidateRecord.content === 'object'
        ? (candidateRecord.content as Record<string, unknown>)
        : null
    const parts = content && Array.isArray(content.parts) ? content.parts : []

    for (const part of parts) {
      if (!part || typeof part !== 'object') {
        continue
      }

      const text = (part as Record<string, unknown>).text
      if (typeof text === 'string' && text.trim()) {
        // Log token usage for monitoring thinkingBudget effectiveness
        if (usageMetadata) {
          logger.info('[extractGeminiStructuredOutput] Token usage', {
            thinkingTokens: usageMetadata.thoughtsTokenCount ?? 0,
            outputTokens: usageMetadata.candidatesTokenCount ?? 0,
            inputTokens: usageMetadata.promptTokenCount ?? 0,
            totalTokens: usageMetadata.totalTokenCount ?? 0,
          })
        }
        return parseStructuredExtractionPayload(text, 'gemini')
      }
    }
  }

  // Extract diagnostic info from the response
  const finishReason = candidates[0] && typeof candidates[0] === 'object'
    ? (candidates[0] as Record<string, unknown>).finishReason
    : 'NO_CANDIDATES'

  logger.error('[extractGeminiStructuredOutput] Gemini returned NO text output', {
    finishReason,
    candidatesCount: candidates.length,
    thoughtsTokens: usageMetadata?.thoughtsTokenCount,
    totalTokens: usageMetadata?.totalTokenCount,
    candidatesTokens: usageMetadata?.candidatesTokenCount,
  })

  throw new Error(
    `Gemini no generó respuesta (finishReason: ${finishReason}, ` +
    `thoughtTokens: ${usageMetadata?.thoughtsTokenCount ?? '?'}, ` +
    `outputTokens: ${usageMetadata?.candidatesTokenCount ?? '?'})`,
  )
}
