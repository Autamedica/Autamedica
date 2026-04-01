"use client"

import type { JSX } from 'react'
import { Activity, Plus } from 'lucide-react'

interface VitalSignsPanelProps {
  onNavigateToPatients?: () => void
}

export function VitalSignsPanel({ onNavigateToPatients }: VitalSignsPanelProps): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 ring-1 ring-emerald-200">
            <Activity className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-am-surface-900">Signos Vitales</h1>
            <p className="text-sm text-am-surface-500">Monitoreo de signos vitales de pacientes</p>
          </div>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-500/20 transition-all duration-am-fast hover:-translate-y-0.5 hover:shadow-am-success active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Registrar Vitales
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center rounded-2xl border border-am-surface-200 bg-white shadow-am-sm">
        <div className="text-center py-16 px-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 mb-4">
            <Activity className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Sin registros de signos vitales</h3>
          <p className="mt-2 max-w-sm mx-auto text-sm text-gray-500">
            Registra signos vitales durante o despues de cada consulta.
            Los datos de tension, frecuencia cardiaca y temperatura quedan en el historial del paciente.
          </p>
          {onNavigateToPatients && (
            <button
              type="button"
              onClick={onNavigateToPatients}
              className="au-interactive au-focus-ring mt-6 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-600 transition-colors"
            >
              Ir a Pacientes
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
