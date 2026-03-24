"use client"

import type { JSX } from 'react'
import { FileText, Search, Plus } from 'lucide-react'

export function RecordsPanel(): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-purple-50 p-2">
            <FileText className="h-6 w-6 text-purple-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-am-surface-900">Historiales Médicos</h1>
            <p className="text-am-surface-500">Registros médicos de tus pacientes</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-white border border-am-surface-300 px-4 py-2 text-sm font-medium text-am-surface-700 shadow-am-sm transition hover:bg-am-surface-100 hover:text-am-surface-900"
          >
            <Search className="h-4 w-4" />
            Buscar
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-am-primary-600 px-4 py-2 text-sm font-medium text-white shadow-am-sm transition hover:bg-am-primary-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo Registro
          </button>
        </div>
      </div>

      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <FileText className="mx-auto h-12 w-12 text-am-surface-400 mb-4" />
          <h3 className="text-lg font-medium text-am-surface-700 mb-2">Sin registros médicos</h3>
          <p className="text-am-surface-400 mb-4">
            Selecciona un paciente desde el panel lateral para ver y gestionar sus registros médicos.
          </p>
        </div>
      </div>
    </div>
  )
}
