/**
 * Hook para análisis de IA médica.
 * Actualmente sin servicio de IA conectado — retorna estado honesto.
 */

import { useEffect, useState, useCallback } from 'react'
import { logger } from '@autamedica/shared'
import type {
  AIAnalysis,
  UseAIAnalysisResult,
  UUID,
} from '@/types/medical'

export function useAIAnalysis(patientId: UUID | null): UseAIAnalysisResult {
  const [analyses, setAnalyses] = useState<AIAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalyses = useCallback(async () => {
    if (!patientId) {
      setAnalyses([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      setAnalyses(prev => prev.filter(a => a.patient_id === patientId))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar análisis de IA: ${errorMessage}`)
      logger.error('[useAIAnalysis] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  const createAnalysis = useCallback(async (_input: {
    symptoms: string[]
    text: string
    context?: string
  }): Promise<AIAnalysis | null> => {
    if (!patientId) {
      throw new Error('ID de paciente requerido')
    }

    setError('El servicio de análisis de IA no está configurado. Contacte soporte.')
    return null
  }, [patientId])

  useEffect(() => {
    fetchAnalyses()
  }, [fetchAnalyses])

  return {
    analyses,
    loading,
    error,
    createAnalysis
  }
}
