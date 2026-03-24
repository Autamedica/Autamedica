"use client"

import type { JSX } from 'react'
import { Activity, Plus } from 'lucide-react'

export function VitalSignsPanel(): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-red-50 p-2">
            <Activity className="h-6 w-6 text-red-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-am-surface-900">Signos Vitales</h1>
            <p className="text-am-surface-500">Monitoreo de signos vitales</p>
          </div>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          Registrar Vitales
        </button>
      </div>

      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <Activity className="mx-auto h-12 w-12 text-am-surface-400 mb-4" />
          <h3 className="text-lg font-medium text-am-surface-700 mb-2">Sin registros de signos vitales</h3>
          <p className="text-am-surface-400">
            Selecciona un paciente desde el panel lateral para ver y registrar sus signos vitales.
          </p>
        </div>
      </div>
    </div>
  )
}
