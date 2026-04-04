'use client'

import { useState } from 'react'
import { Brain, Bot, FileText, AlertCircle } from 'lucide-react'

export function DiagnosisPanel() {
  const [symptoms, setSymptoms] = useState('')
  const [medicalHistory, setMedicalHistory] = useState('')
  const [vitalSigns, setVitalSigns] = useState('')

  return (
    <div className="h-full bg-white text-am-surface-900">
      <div className="p-6 border-b border-am-surface-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-am-doctor-50 rounded-lg">
            <Brain className="w-6 h-6 text-am-doctor-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-am-surface-900">IA Diagnóstico</h1>
            <p className="text-sm text-am-surface-500">Asistente de inteligencia artificial para diagnósticos médicos</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100%-100px)]">
        {/* Panel de entrada — notas manuales del doctor */}
        <div className="w-full lg:w-1/2 p-6 border-r border-am-surface-200">
          <h2 className="text-lg font-medium text-am-surface-900 mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5 text-am-doctor-600" />
            Nueva Consulta IA
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-am-surface-700 mb-2">
                Síntomas Principales *
              </label>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                className="w-full h-24 px-3 py-2 bg-white border border-am-surface-300 rounded-lg text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-500 resize-none"
                placeholder="Describe los síntomas principales del paciente..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-am-surface-700 mb-2">
                Antecedentes Médicos
              </label>
              <textarea
                value={medicalHistory}
                onChange={(e) => setMedicalHistory(e.target.value)}
                className="w-full h-20 px-3 py-2 bg-white border border-am-surface-300 rounded-lg text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-500 resize-none"
                placeholder="Antecedentes médicos relevantes..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-am-surface-700 mb-2">
                Signos Vitales
              </label>
              <textarea
                value={vitalSigns}
                onChange={(e) => setVitalSigns(e.target.value)}
                className="w-full h-16 px-3 py-2 bg-white border border-am-surface-300 rounded-lg text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-500 resize-none"
                placeholder="PA, FC, FR, Temperatura, Sat O2..."
              />
            </div>

            <div className="p-3 bg-am-surface-50 border border-am-surface-200 rounded-lg">
              <p className="text-sm text-am-surface-600 font-medium mb-1">
                Análisis con IA próximamente disponible
              </p>
              <p className="text-sm text-am-surface-500">
                El servicio de diagnóstico asistido por IA se encuentra en desarrollo.
                Puede utilizar estos campos como notas clínicas de la consulta.
              </p>
            </div>

            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-2 bg-am-surface-200 text-am-surface-400 font-medium py-2 px-4 rounded-lg cursor-not-allowed"
              aria-disabled="true"
            >
              <Brain className="w-4 h-4" />
              Analizar con IA
            </button>
          </div>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-amber-700 font-medium mb-1">Importante</p>
                <p className="text-amber-700">
                  La IA es una herramienta de apoyo. Siempre confirme con evaluación clínica presencial.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Panel de resultados — vacío hasta que se habilite el servicio */}
        <div className="w-full lg:w-1/2 p-6">
          <h2 className="text-lg font-medium text-am-surface-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-am-doctor-600" />
            Historial de Análisis
          </h2>

          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="w-12 h-12 text-am-surface-300 mb-4" />
            <p className="text-sm text-am-surface-500">
              El historial de análisis estará disponible cuando se habilite el servicio de IA diagnóstico.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
