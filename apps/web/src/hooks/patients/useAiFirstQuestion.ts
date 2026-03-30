'use client'

import { useCallback, useState } from 'react'
import { fetchApi } from '@/lib/api-client'

export interface AiQuestion {
  id: string
  question: string
  type: 'open' | 'closed' | 'scale' | 'select'
  priority: 'critical' | 'high' | 'medium'
  targetSection: string
  rationale: string
  options?: string[]
}

interface AiQuestionResponse {
  questions: AiQuestion[]
  detectedSections: string[]
  urgencyLevel: 'normal' | 'attention' | 'urgent'
}

interface UseAiFirstQuestionReturn {
  /** Send chief complaint to AI and get follow-up questions */
  askAi: (chiefComplaint: string) => Promise<AiQuestionResponse | null>
  /** AI-generated follow-up questions */
  aiQuestions: AiQuestion[]
  /** Detected sections from chief complaint */
  detectedSections: string[]
  /** Urgency level */
  urgencyLevel: 'normal' | 'attention' | 'urgent'
  /** Loading state */
  loading: boolean
  /** Error message */
  error: string | null
}

/**
 * Hook: AI-first question for anamnesis.
 * Patient describes chief complaint → Gemini generates follow-up questions.
 */
export function useAiFirstQuestion(): UseAiFirstQuestionReturn {
  const [aiQuestions, setAiQuestions] = useState<AiQuestion[]>([])
  const [detectedSections, setDetectedSections] = useState<string[]>([])
  const [urgencyLevel, setUrgencyLevel] = useState<'normal' | 'attention' | 'urgent'>('normal')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const askAi = useCallback(async (chiefComplaint: string): Promise<AiQuestionResponse | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchApi<{ success: boolean; data?: AiQuestionResponse; error?: string }>(
        '/api/patients/anamnesis/ai-question',
        {
          method: 'POST',
          body: { chiefComplaint },
        },
      )

      if (!res.success || !res.data) {
        // AI not available — graceful fallback
        setError(res.error ?? 'ai_unavailable')
        return null
      }

      setAiQuestions(res.data.questions)
      setDetectedSections(res.data.detectedSections)
      setUrgencyLevel(res.data.urgencyLevel)
      return res.data
    } catch {
      setError('network_error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    askAi,
    aiQuestions,
    detectedSections,
    urgencyLevel,
    loading,
    error,
  }
}
