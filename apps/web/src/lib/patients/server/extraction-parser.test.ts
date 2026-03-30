import { describe, expect, it } from 'vitest'
import {
  isJsonObject,
  extractGeminiStructuredOutput,
  extractOpenAiStructuredOutput,
  parseStructuredExtractionPayload,
} from './extraction-parser'

// ─── isJsonObject ────────────────────────────────────────────────────
describe('isJsonObject', () => {
  it('returns true for plain objects', () => {
    expect(isJsonObject({})).toBe(true)
    expect(isJsonObject({ a: 1 })).toBe(true)
  })

  it('returns false for arrays', () => {
    expect(isJsonObject([])).toBe(false)
    expect(isJsonObject([1, 2])).toBe(false)
  })

  it('returns false for primitives and null', () => {
    expect(isJsonObject(null)).toBe(false)
    expect(isJsonObject('string' as never)).toBe(false)
    expect(isJsonObject(42 as never)).toBe(false)
    expect(isJsonObject(true as never)).toBe(false)
  })
})

// ─── parseStructuredExtractionPayload ────────────────────────────────
describe('parseStructuredExtractionPayload', () => {
  it('parses valid JSON and returns result', () => {
    const payload = JSON.stringify({
      nextQuestions: [],
      qualityAlerts: [],
      argenteCoverage: { adequatelyCovered: [], weakOrMissing: [] },
      safetyFlags: [],
    })

    const result = parseStructuredExtractionPayload(payload, 'gemini')
    expect(result.nextQuestions).toEqual([])
    expect(result.safetyFlags).toEqual([])
  })

  it('throws on invalid JSON', () => {
    expect(() =>
      parseStructuredExtractionPayload('not json', 'gemini'),
    ).toThrow('La salida del modelo no fue JSON valido')
  })

  it('returns raw data when Zod validation fails (warn-and-continue)', () => {
    // Missing required fields — Zod will fail but function returns raw
    const payload = JSON.stringify({ unexpected: 'data' })
    const result = parseStructuredExtractionPayload(payload, 'openai')
    expect((result as Record<string, unknown>).unexpected).toBe('data')
  })

  it('handles valid payload with populated fields', () => {
    const payload = JSON.stringify({
      nextQuestions: [
        { id: 'q1', question: '¿Cuánto hace?', priority: 'high', targetSection: 'sintomas' },
      ],
      qualityAlerts: [{ type: 'missing_info', message: 'Falta duración' }],
      argenteCoverage: {
        adequatelyCovered: ['motivo_consulta'],
        weakOrMissing: ['antecedentes'],
      },
      safetyFlags: [],
    })

    const result = parseStructuredExtractionPayload(payload, 'gemini')
    expect(result.nextQuestions).toHaveLength(1)
    expect(result.nextQuestions[0].priority).toBe('high')
    expect(result.argenteCoverage.adequatelyCovered).toContain('motivo_consulta')
  })
})

// ─── extractGeminiStructuredOutput ───────────────────────────────────
describe('extractGeminiStructuredOutput', () => {
  const validGeminiPayload = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                nextQuestions: [],
                qualityAlerts: [],
                argenteCoverage: { adequatelyCovered: ['motivo'], weakOrMissing: [] },
                safetyFlags: [],
              }),
            },
          ],
        },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: 1000,
      candidatesTokenCount: 500,
      thoughtsTokenCount: 200,
      totalTokenCount: 1700,
    },
  }

  it('extracts valid structured output from Gemini response', () => {
    const result = extractGeminiStructuredOutput(validGeminiPayload)
    expect(result.argenteCoverage.adequatelyCovered).toContain('motivo')
    expect(result.nextQuestions).toEqual([])
  })

  it('throws when candidates array is empty', () => {
    expect(() => extractGeminiStructuredOutput({ candidates: [] })).toThrow(
      /Gemini no generó respuesta/,
    )
  })

  it('throws when no text in parts (thinking token exhaustion)', () => {
    const emptyPayload = {
      candidates: [
        {
          content: { parts: [] },
          finishReason: 'MAX_TOKENS',
        },
      ],
      usageMetadata: {
        thoughtsTokenCount: 16000,
        candidatesTokenCount: 0,
        totalTokenCount: 16000,
      },
    }

    expect(() => extractGeminiStructuredOutput(emptyPayload)).toThrow(
      /finishReason: MAX_TOKENS/,
    )
  })

  it('throws when candidates have no content', () => {
    expect(() =>
      extractGeminiStructuredOutput({ candidates: [{ finishReason: 'SAFETY' }] }),
    ).toThrow(/Gemini no generó respuesta/)
  })

  it('includes token counts in error message', () => {
    const payload = {
      candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }],
      usageMetadata: { thoughtsTokenCount: 14000, candidatesTokenCount: 0 },
    }

    try {
      extractGeminiStructuredOutput(payload)
      expect.unreachable('should have thrown')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('thoughtTokens: 14000')
      expect(msg).toContain('outputTokens: 0')
    }
  })

  it('skips non-object candidates', () => {
    expect(() =>
      extractGeminiStructuredOutput({ candidates: [null, 'invalid', 42] }),
    ).toThrow(/Gemini no generó respuesta/)
  })

  it('skips parts with non-string text', () => {
    const payload = {
      candidates: [
        { content: { parts: [{ text: 123 }, { text: null }] }, finishReason: 'STOP' },
      ],
    }
    expect(() => extractGeminiStructuredOutput(payload)).toThrow()
  })

  it('skips empty string text parts', () => {
    const payload = {
      candidates: [
        { content: { parts: [{ text: '   ' }] }, finishReason: 'STOP' },
      ],
    }
    expect(() => extractGeminiStructuredOutput(payload)).toThrow()
  })
})

// ─── extractOpenAiStructuredOutput ───────────────────────────────────
describe('extractOpenAiStructuredOutput', () => {
  it('extracts from output_text field', () => {
    const payload = {
      output_text: JSON.stringify({
        nextQuestions: [],
        qualityAlerts: [],
        argenteCoverage: { adequatelyCovered: [], weakOrMissing: [] },
        safetyFlags: [],
      }),
    }

    const result = extractOpenAiStructuredOutput(payload)
    expect(result.nextQuestions).toEqual([])
  })

  it('extracts from output[].content[].text', () => {
    const payload = {
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                nextQuestions: [{ id: 'q1', question: 'test', priority: 'medium' }],
                qualityAlerts: [],
                argenteCoverage: { adequatelyCovered: [], weakOrMissing: [] },
                safetyFlags: [],
              }),
            },
          ],
        },
      ],
    }

    const result = extractOpenAiStructuredOutput(payload)
    expect(result.nextQuestions).toHaveLength(1)
  })

  it('throws when no structured content found', () => {
    expect(() => extractOpenAiStructuredOutput({})).toThrow(
      /no incluyo contenido estructurado/,
    )
  })

  it('throws when output array has no valid entries', () => {
    expect(() =>
      extractOpenAiStructuredOutput({ output: [null, { content: [] }] }),
    ).toThrow()
  })
})
