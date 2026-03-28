import { Brain, CheckCircle2, Loader2 } from 'lucide-react'
import type { JSX } from 'react'

interface DiagnosisPanelProps {
  patientDisplayName: string
  aiProcessing: boolean
  onClose: () => void
}

export function DiagnosisPanel({ patientDisplayName, aiProcessing, onClose }: DiagnosisPanelProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-am-surface-200 bg-white p-5 shadow-am-xl sm:p-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-am-surface-900">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-am-doctor-50 to-am-primary-50 ring-1 ring-am-doctor-200">
              <Brain className="h-5 w-5 text-am-doctor-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Análisis IA · {patientDisplayName}</h2>
              <p className="text-xs text-am-surface-500">Carga un resumen de síntomas para generar diagnósticos asistidos.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="self-start rounded-xl border border-am-surface-200 px-4 py-1.5 text-xs font-medium text-am-surface-700 transition-all duration-am-fast hover:border-am-surface-300 hover:bg-am-surface-50 hover:text-am-surface-900 active:scale-95 sm:self-auto"
          >
            Cerrar
          </button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-am-surface-800">
            <span className="font-medium">Síntomas principales</span>
            <textarea
              placeholder="Describe los síntomas del paciente..."
              className="min-h-[120px] w-full rounded-xl border border-am-surface-200 bg-am-surface-50 p-3 text-sm text-am-surface-900 placeholder:text-am-surface-400 transition-all duration-am-fast focus:border-am-doctor-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-400/30"
            />
          </label>
          <label className="space-y-2 text-sm text-am-surface-800">
            <span className="font-medium">Duración de síntomas</span>
            <input
              placeholder="Ej: 3 días"
              className="w-full rounded-xl border border-am-surface-200 bg-am-surface-50 p-3 text-sm text-am-surface-900 placeholder:text-am-surface-400 transition-all duration-am-fast focus:border-am-doctor-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-400/30"
            />
          </label>
        </div>

        {aiProcessing && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-am-doctor-200 bg-am-doctor-50 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-am-doctor-600" />
            <p className="text-sm font-medium text-am-doctor-700">Analizando síntomas con IA...</p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-am-surface-500">
            <CheckCircle2 className="h-4 w-4 text-am-doctor-500" />
            Datos encriptados y auditados.
          </div>
          <button
            type="button"
            disabled={aiProcessing}
            className="flex items-center gap-2 self-stretch rounded-xl bg-gradient-to-r from-am-doctor-600 to-am-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-am-doctor-500/20 transition-all duration-am-fast hover:-translate-y-0.5 hover:shadow-am-doctor disabled:opacity-50 sm:self-auto"
          >
            <Brain className="h-4 w-4" />
            {aiProcessing ? 'Analizando...' : 'Analizar con IA'}
          </button>
        </div>
      </div>
    </div>
  )
}
