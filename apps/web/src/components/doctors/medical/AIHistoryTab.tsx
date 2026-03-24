/**
 * Componente de historial de análisis de IA para el portal de médicos
 */

'use client'

import { useAIAnalysis } from '@/hooks/doctors/useAIAnalysis'
import type { DiagnosticConfidence, UUID } from '@/types/medical'
import {
    Activity,
    AlertTriangle,
    Brain,
    Calendar,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Search,
    Stethoscope,
    Target,
    Zap
} from 'lucide-react'
import type { JSX } from 'react'
import { useState } from 'react'

interface AIHistoryTabProps {
  patientId: UUID | null
}

const CONFIDENCE_CONFIG: Record<DiagnosticConfidence, {
  label: string
  color: string
  icon: React.ElementType
}> = {
  alta: {
    label: 'Alta confianza',
    color: 'bg-green-50 text-green-700 border-green-200',
    icon: CheckCircle
  },
  media: {
    label: 'Confianza media',
    color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    icon: Target
  },
  baja: {
    label: 'Baja confianza',
    color: 'bg-red-50 text-red-700 border-red-200',
    icon: AlertTriangle
  }
}

export function AIHistoryTab({ patientId }: AIHistoryTabProps): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null)
  const [showNewAnalysisForm, setShowNewAnalysisForm] = useState(false)

  const { analyses, loading, error } = useAIAnalysis(patientId)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getConfidenceScore = (score: number): string => {
    return `${Math.round(score * 100)}%`
  }

  const filteredAnalyses = analyses.filter(analysis =>
    searchTerm === '' ||
    analysis.primary_diagnosis.condition.toLowerCase().includes(searchTerm.toLowerCase()) ||
    analysis.input_symptoms.some(symptom =>
      symptom.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  if (loading && analyses.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-gray-500">Cargando análisis de IA...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Error al cargar análisis</h3>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!patientId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Brain className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Sin paciente seleccionado</h3>
          <p className="text-gray-500">Selecciona un paciente para ver su historial de IA</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-neutral-50">

      {/* Header */}
      <div className="border-b border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Brain className="h-6 w-6 text-purple-500" />
              Historial de Análisis IA
              <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 border border-purple-200">
                BETA
              </span>
            </h1>
            <p className="text-sm text-gray-500">
              {filteredAnalyses.length} análisis encontrado{filteredAnalyses.length !== 1 ? 's' : ''}
            </p>
          </div>

          <button
            onClick={() => setShowNewAnalysisForm(!showNewAnalysisForm)}
            className="flex items-center gap-2 rounded-lg border border-purple-600 bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition"
          >
            <Brain className="h-4 w-4" />
            Nuevo Análisis IA
          </button>
        </div>

        {/* Búsqueda */}
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por diagnóstico o síntomas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredAnalyses.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Brain className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {analyses.length === 0 ? 'Sin análisis de IA' : 'No se encontraron resultados'}
              </h3>
              <p className="text-gray-500 mb-4">
                {analyses.length === 0
                  ? 'Este paciente aún no tiene análisis realizados por IA'
                  : 'No se encontraron análisis que coincidan con la búsqueda'
                }
              </p>
              {analyses.length === 0 && (
                <button
                  onClick={() => setShowNewAnalysisForm(true)}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition mx-auto"
                >
                  <Brain className="h-4 w-4" />
                  Primer Análisis IA
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAnalyses.map((analysis) => {
              const isExpanded = expandedAnalysis === analysis.id
              const confidenceConfig = CONFIDENCE_CONFIG[analysis.primary_diagnosis.confidence]
              const ConfidenceIcon = confidenceConfig.icon

              return (
                <div
                  key={analysis.id}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                >
                  {/* Header del análisis */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-medium border ${confidenceConfig.color}`}>
                            <ConfidenceIcon className="inline h-3 w-3 mr-1" />
                            {confidenceConfig.label}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="h-3 w-3" />
                            {formatDate(analysis.created_at)}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Zap className="h-3 w-3" />
                            {analysis.processing_time_ms}ms
                          </div>
                        </div>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {analysis.primary_diagnosis.condition}
                        </h3>

                        <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                          <div className="flex items-center gap-1">
                            <Target className="h-4 w-4" />
                            <span>Confianza: {getConfidenceScore(analysis.confidence_score)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Activity className="h-4 w-4" />
                            <span>Modelo: {analysis.model_version}</span>
                          </div>
                        </div>

                        {/* Síntomas de entrada */}
                        <div className="flex flex-wrap gap-2">
                          {analysis.input_symptoms.map((symptom, index) => (
                            <span
                              key={index}
                              className="rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-700 border border-gray-200"
                            >
                              {symptom}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedAnalysis(isExpanded ? null : analysis.id)}
                        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
                      >
                        Ver detalles
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Descripción del diagnóstico principal */}
                    <div className="rounded-lg bg-neutral-50 p-3">
                      <p className="text-sm text-gray-700">{analysis.primary_diagnosis.description}</p>
                      {analysis.primary_diagnosis.icd_code && (
                        <p className="text-xs text-gray-500 mt-1">
                          Código ICD: {analysis.primary_diagnosis.icd_code}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Contenido expandido */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-neutral-50 p-4">
                      <div className="space-y-6">

                        {/* Razonamiento del diagnóstico principal */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <Stethoscope className="h-4 w-4" />
                            Razonamiento del Diagnóstico
                          </h4>
                          <p className="text-sm text-gray-500 bg-white rounded-lg p-3 border border-gray-200">
                            {analysis.primary_diagnosis.reasoning}
                          </p>
                        </div>

                        {/* Diagnósticos diferenciales */}
                        {analysis.differential_diagnoses.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">
                              Diagnósticos Diferenciales
                            </h4>
                            <div className="space-y-2">
                              {analysis.differential_diagnoses.map((diagnosis, index) => {
                                const diffConfig = CONFIDENCE_CONFIG[diagnosis.confidence]
                                const DiffIcon = diffConfig.icon

                                return (
                                  <div key={index} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3">
                                    <div className="flex items-start justify-between mb-2">
                                      <h5 className="font-medium text-gray-800">{diagnosis.condition}</h5>
                                      <div className="flex items-center gap-2">
                                        <span className={`rounded-full px-2 py-1 text-xs font-medium border ${diffConfig.color}`}>
                                          <DiffIcon className="inline h-3 w-3 mr-1" />
                                          {getConfidenceScore(diagnosis.probability)}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="text-sm text-gray-500">{diagnosis.description}</p>
                                    {diagnosis.icd_code && (
                                      <p className="text-xs text-gray-400 mt-1">ICD: {diagnosis.icd_code}</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Sugerencias de tratamiento */}
                        {analysis.treatment_suggestions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">
                              Sugerencias de Tratamiento
                            </h4>
                            <div className="space-y-2">
                              {analysis.treatment_suggestions.map((suggestion, index) => (
                                <div key={index} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3">
                                  <div className="flex items-start justify-between mb-2">
                                    <h5 className="font-medium text-gray-800">{suggestion.treatment}</h5>
                                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                                      suggestion.priority === 'alta' ? 'bg-red-50 text-red-700 border border-red-200' :
                                      suggestion.priority === 'media' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                      'bg-green-50 text-green-700 border border-green-200'
                                    }`}>
                                      {suggestion.priority === 'alta' ? 'Alta prioridad' :
                                       suggestion.priority === 'media' ? 'Prioridad media' : 'Baja prioridad'}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-500 mb-2">{suggestion.details}</p>
                                  <p className="text-xs text-gray-400">Tipo: {suggestion.type.replace('_', ' ')}</p>
                                  {suggestion.contraindications.length > 0 && (
                                    <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2">
                                      <p className="text-xs text-red-700">
                                        <AlertTriangle className="inline h-3 w-3 mr-1" />
                                        Contraindicaciones: {suggestion.contraindications.join(', ')}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Factores de riesgo */}
                        {analysis.risk_factors.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">
                              Factores de Riesgo Identificados
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {analysis.risk_factors.map((factor, index) => (
                                <span
                                  key={index}
                                  className="rounded-lg bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 border border-orange-200"
                                >
                                  <AlertTriangle className="inline h-3 w-3 mr-1" />
                                  {factor}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Contexto adicional */}
                        {analysis.additional_context && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">
                              Contexto Adicional
                            </h4>
                            <p className="text-sm text-gray-500 bg-white rounded-lg p-3 border border-gray-200">
                              {analysis.additional_context}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
