/**
 * Hook: useAnamnesisGuidance — manages AI extraction checkpoints during anamnesis.
 * Capa 2 — Estado + API calls, sin lógica de negocio.
 */
import { useState, useCallback, useRef } from 'react'
import { ApiError, fetchApi } from '@/lib/api-client'
import {
  transformGuidance,
  hasActionableGuidance,
  type ExtractionGuidance,
} from '@/lib/patients/services/anamnesis-guidance.service'
import type { ExtractionServiceResult } from '@/lib/patients/services/anamnesis-extraction.service'
import { logger } from '@autamedica/shared'

export interface ClarificationTurn {
  question: string
  answer: string
  timestamp: string
}

interface UseAnamnesisGuidanceReturn {
  guidance: ExtractionGuidance | null
  clarificationTurns: ClarificationTurn[]
  isExtracting: boolean
  extractionError: string | null
  authRequired: boolean
  triggerExtraction: (checkpoint: 'partial' | 'final') => Promise<ExtractionGuidance | null>
  addClarification: (question: string, answer: string) => void
  dismissGuidance: () => void
}

export function useAnamnesisGuidance(): UseAnamnesisGuidanceReturn {
  const [guidance, setGuidance] = useState<ExtractionGuidance | null>(null)
  const [clarificationTurns, setClarificationTurns] = useState<ClarificationTurn[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const triggerExtraction = useCallback(async (
    checkpoint: 'partial' | 'final',
  ): Promise<ExtractionGuidance | null> => {
    // Cancel any in-flight extraction
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setIsExtracting(true)
    setExtractionError(null)
    setAuthRequired(false)

    try {
      const result = await fetchApi<{ data: ExtractionServiceResult }>(
        '/api/patients/anamnesis/extract',
        {
          method: 'POST',
          body: {
            checkpoint,
            clarificationTurns: clarificationTurns.map(t => ({
              question: t.question,
              answer: t.answer,
            })),
          },
        },
      )

      const transformed = transformGuidance(result.data)

      if (hasActionableGuidance(transformed)) {
        setGuidance(transformed)
        return transformed
      }

      // No actionable questions — clear guidance
      setGuidance(null)
      return null
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthRequired(true)
        setExtractionError('unauthorized')
        setGuidance(null)
        return null
      }

      // Non-blocking for partial checkpoint — patient can continue
      if (checkpoint === 'partial') {
        logger.warn('[useAnamnesisGuidance] Partial extraction failed, continuing', err)
        setGuidance(null)
        return null
      }

      // Blocking for final — show error but don't prevent completion
      logger.error('[useAnamnesisGuidance] Final extraction failed', err)
      setExtractionError('No pudimos analizar tu historia clínica. Podés continuar igualmente.')
      setGuidance(null)
      return null
    } finally {
      setIsExtracting(false)
    }
  }, [clarificationTurns])

  const addClarification = useCallback((question: string, answer: string) => {
    setClarificationTurns(prev => [
      ...prev,
      { question, answer, timestamp: new Date().toISOString() },
    ])
  }, [])

  const dismissGuidance = useCallback(() => {
    setGuidance(null)
  }, [])

  return {
    guidance,
    clarificationTurns,
    isExtracting,
    extractionError,
    authRequired,
    triggerExtraction,
    addClarification,
    dismissGuidance,
  }
}
