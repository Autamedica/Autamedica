'use client'

import { useState } from 'react'
import { Brain, Send, Bot, FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react'

interface DiagnosisRequest {
  id: string
  patientId: string
  symptoms: string
  medicalHistory: string
  vitalSigns?: string
  status: 'analyzing' | 'completed' | 'error'
  createdAt: string
  result?: DiagnosisResult
}

interface DiagnosisResult {
  primaryDiagnosis: string
  confidence: number
  differentialDiagnoses: string[]
  recommendedTests: string[]
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical'
  reasoning: string
}

export function DiagnosisPanel() {
  const [symptoms, setSymptoms] = useState('')
  const [medicalHistory, setMedicalHistory] = useState('')
  const [vitalSigns, setVitalSigns] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [diagnosisHistory, setDiagnosisHistory] = useState<DiagnosisRequest[]>([])

  const handleAnalyze = async () => {
    if (!symptoms.trim()) return

    setIsAnalyzing(true)

    const newRequest: DiagnosisRequest = {
      id: Date.now().toString(),
      patientId: '',
      symptoms,
      medicalHistory,
      vitalSigns,
      status: 'analyzing',
      createdAt: new Date().toISOString()
    }

    setDiagnosisHistory(prev => [newRequest, ...prev])

    // Servicio de IA no configurado — marcar como error
    setDiagnosisHistory(prev =>
      prev.map(req =>
        req.id === newRequest.id
          ? { ...req, status: 'error' as const }
          : req
      )
    )
    setIsAnalyzing(false)
    setSymptoms('')
    setMedicalHistory('')
    setVitalSigns('')
  }

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-500 bg-red-50 border-red-200'
      case 'high': return 'text-orange-500 bg-orange-50 border-orange-200'
      case 'medium': return 'text-yellow-500 bg-yellow-50 border-yellow-200'
      default: return 'text-green-500 bg-green-50 border-green-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'analyzing': return <Clock className="w-4 h-4 text-blue-500 animate-spin" />
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />
      default: return null
    }
  }

  return (
    <div className="h-full bg-[#101d32] text-slate-100">
      <div className="p-6 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Brain className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">IA Diagnóstico</h1>
            <p className="text-sm text-slate-400">Asistente de inteligencia artificial para diagnósticos médicos</p>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100%-100px)]">
        {/* Panel de entrada */}
        <div className="w-1/2 p-6 border-r border-slate-800/60">
          <h2 className="text-lg font-medium text-slate-100 mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            Nueva Consulta IA
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Síntomas Principales *
              </label>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                className="w-full h-24 px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Describe los síntomas principales del paciente..."
                disabled={isAnalyzing}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Antecedentes Médicos
              </label>
              <textarea
                value={medicalHistory}
                onChange={(e) => setMedicalHistory(e.target.value)}
                className="w-full h-20 px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Antecedentes médicos relevantes..."
                disabled={isAnalyzing}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Signos Vitales
              </label>
              <textarea
                value={vitalSigns}
                onChange={(e) => setVitalSigns(e.target.value)}
                className="w-full h-16 px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="PA, FC, FR, Temperatura, Sat O2..."
                disabled={isAnalyzing}
              />
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!symptoms.trim() || isAnalyzing}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {isAnalyzing ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Analizar con IA
                </>
              )}
            </button>
          </div>

          <div className="mt-6 p-4 bg-amber-900/20 border border-amber-800/40 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-amber-400 font-medium mb-1">Importante</p>
                <p className="text-amber-300">
                  La IA es una herramienta de apoyo. Siempre confirme con evaluación clínica presencial.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Panel de resultados */}
        <div className="w-1/2 p-6">
          <h2 className="text-lg font-medium text-slate-100 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            Historial de Análisis
          </h2>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {diagnosisHistory.map((diagnosis) => (
              <div key={diagnosis.id} className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(diagnosis.status)}
                    <span className="text-sm text-slate-400">
                      {new Date(diagnosis.createdAt).toLocaleString('es-ES')}
                    </span>
                  </div>
                  {diagnosis.result && (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getUrgencyColor(diagnosis.result.urgencyLevel)}`}>
                      {diagnosis.result.urgencyLevel.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-slate-400">Síntomas:</span>
                    <p className="text-slate-200">{diagnosis.symptoms}</p>
                  </div>

                  {diagnosis.result && (
                    <>
                      <div>
                        <span className="text-slate-400">Diagnóstico Principal:</span>
                        <p className="text-slate-100 font-medium">{diagnosis.result.primaryDiagnosis}</p>
                        <p className="text-slate-400 text-xs">Confianza: {diagnosis.result.confidence}%</p>
                      </div>

                      <div>
                        <span className="text-slate-400">Diagnósticos Diferenciales:</span>
                        <ul className="text-slate-200 list-disc list-inside ml-2">
                          {diagnosis.result.differentialDiagnoses.map((diff, idx) => (
                            <li key={idx}>{diff}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <span className="text-slate-400">Estudios Recomendados:</span>
                        <ul className="text-slate-200 list-disc list-inside ml-2">
                          {diagnosis.result.recommendedTests.map((test, idx) => (
                            <li key={idx}>{test}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <span className="text-slate-400">Razonamiento:</span>
                        <p className="text-slate-200">{diagnosis.result.reasoning}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}