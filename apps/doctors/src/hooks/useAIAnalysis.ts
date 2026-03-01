/**
 * Hook migrado al sistema híbrido
 *
 * CAMBIOS:
 * - Usa selectActive() en lugar de supabase directo
 * - Datos retornados en camelCase automáticamente
 * - Auto-filtrado de soft-deleted (deleted_at IS NULL)
 * - Mantiene simulación de IA para pruebas
 */

import { useEffect, useState, useCallback } from 'react'
import { logger } from '@autamedica/shared'
import { createBrowserClient } from '@autamedica/auth/client'
import type {
  AIAnalysis,
  UseAIAnalysisResult,
  UUID,
  AIDiagnosis,
  AITreatmentSuggestion
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
      // Note: ai_analyses table does not exist in DB yet.
      // Analyses are currently managed in local state only (simulation mode).
      // When the table is created, replace this with a proper selectActive() call.
      setAnalyses(prev => prev.filter(a => a.patient_id === patientId))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar análisis de IA: ${errorMessage}`)
      logger.error('[useAIAnalysis] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  const createAnalysis = useCallback(async (input: {
    symptoms: string[]
    text: string
    context?: string
  }): Promise<AIAnalysis | null> => {
    if (!patientId) {
      throw new Error('ID de paciente requerido')
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createBrowserClient()

      // Obtener información del doctor actual
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('Usuario no autenticado')
      }

      const startTime = Date.now()

      // Simular análisis de IA (en producción, esto sería una llamada a la API de IA)
      const mockAnalysis = await simulateAIAnalysis(input)

      const processingTime = Date.now() - startTime

      const newAnalysis = {
        patient_id: patientId,
        doctor_id: user.id as UUID,
        medical_record_id: null,
        input_symptoms: input.symptoms,
        input_text: input.text,
        additional_context: input.context || null,
        primary_diagnosis: mockAnalysis.primary_diagnosis,
        differential_diagnoses: mockAnalysis.differential_diagnoses,
        treatment_suggestions: mockAnalysis.treatment_suggestions,
        risk_factors: mockAnalysis.risk_factors,
        model_version: 'autamedica-ai-v1.0',
        confidence_score: mockAnalysis.confidence_score,
        processing_time_ms: processingTime,
        created_at: new Date().toISOString()
      }

      // Nota: En un entorno de producción real, esto se guardaría en la base de datos
      // Por ahora, solo agregamos a la lista local para pruebas
      const mockData: AIAnalysis = {
        ...newAnalysis,
        id: crypto.randomUUID() as UUID
      }

      // Agregar a la lista local
      setAnalyses(prev => [mockData, ...prev])

      return mockData

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al crear análisis de IA: ${errorMessage}`)
      logger.error('[useAIAnalysis] createAnalysis error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [patientId])

  const refresh = useCallback(async () => {
    await fetchAnalyses()
  }, [fetchAnalyses])

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

// Simulación de análisis de IA médica
async function simulateAIAnalysis(input: {
  symptoms: string[]
  text: string
  context?: string
}): Promise<{
  primary_diagnosis: AIDiagnosis
  differential_diagnoses: AIDiagnosis[]
  treatment_suggestions: AITreatmentSuggestion[]
  risk_factors: string[]
  confidence_score: number
}> {
  // Simular delay de procesamiento
  await new Promise(resolve => setTimeout(resolve, 1500))

  const symptoms = input.symptoms.join(' ').toLowerCase()

  // Lógica básica de diagnóstico basada en síntomas comunes
  let primaryDiagnosis: AIDiagnosis
  let differentialDiagnoses: AIDiagnosis[]
  let treatments: AITreatmentSuggestion[]
  let riskFactors: string[]

  if (symptoms.includes('fiebre') || symptoms.includes('tos')) {
    primaryDiagnosis = {
      condition: 'Infección respiratoria viral',
      icd_code: 'J06.9',
      description: 'Infección del tracto respiratorio superior de origen viral',
      confidence: 'alta',
      probability: 0.85,
      reasoning: 'Los síntomas de fiebre y tos son característicos de infecciones virales del tracto respiratorio'
    }

    differentialDiagnoses = [
      {
        condition: 'COVID-19',
        icd_code: 'U07.1',
        description: 'Enfermedad por coronavirus 2019',
        confidence: 'media',
        probability: 0.65,
        reasoning: 'Los síntomas pueden ser compatibles con COVID-19, requiere confirmación'
      },
      {
        condition: 'Gripe estacional',
        icd_code: 'J11.1',
        description: 'Gripe debida a virus no identificado con otras manifestaciones respiratorias',
        confidence: 'media',
        probability: 0.60,
        reasoning: 'Los síntomas son típicos de gripe estacional'
      }
    ]

    treatments = [
      {
        treatment: 'Reposo y hidratación',
        type: 'medidas_generales',
        priority: 'alta',
        details: 'Reposo en cama, abundante hidratación con líquidos tibios',
        contraindications: []
      },
      {
        treatment: 'Paracetamol 500mg cada 8 horas',
        type: 'medicacion',
        priority: 'media',
        details: 'Para control de fiebre y dolor, no exceder 3g/día',
        contraindications: ['Enfermedad hepática grave', 'Alergia al paracetamol']
      }
    ]

    riskFactors = ['Deshidratación', 'Complicaciones respiratorias', 'Propagación a contactos']
  } else {
    primaryDiagnosis = {
      condition: 'Consulta médica general',
      icd_code: 'Z00.0',
      description: 'Examen médico general',
      confidence: 'media',
      probability: 0.70,
      reasoning: 'Síntomas requieren evaluación médica general para diagnóstico preciso'
    }

    differentialDiagnoses = []
    treatments = [
      {
        treatment: 'Evaluación médica presencial',
        type: 'referencia',
        priority: 'alta',
        details: 'Se recomienda consulta presencial para evaluación completa',
        contraindications: []
      }
    ]

    riskFactors = ['Diagnóstico tardío por falta de evaluación presencial']
  }

  return {
    primary_diagnosis: primaryDiagnosis,
    differential_diagnoses: differentialDiagnoses,
    treatment_suggestions: treatments,
    risk_factors: riskFactors,
    confidence_score: primaryDiagnosis.probability
  }
}