"use client"

import type { JSX } from 'react'
import { Activity, Plus } from 'lucide-react'

export function VitalSignsPanel(): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 ring-1 ring-emerald-200">
            <Activity className="h-5 w-5 text-emerald-600" />
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
        <div className="flex flex-col items-center text-center max-w-md px-6 py-12">
          <div className="relative mb-6">
            <div className="absolute -inset-6 rounded-full bg-emerald-50/60" />
            <div className="absolute -inset-3 rounded-full bg-emerald-50" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Activity className="h-7 w-7 text-white" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-am-surface-900">Sin registros de signos vitales</h3>
          <p className="mt-2 text-sm text-am-surface-500">
            Selecciona un paciente desde el panel lateral para ver y registrar sus signos vitales.
          </p>
        </div>
      </div>
    </div>
  )
}
