"use client"

import type { JSX } from 'react'
import { FileText, Search, Plus, Users } from 'lucide-react'

interface RecordsPanelProps {
  onNavigateToPatients?: () => void
}

export function RecordsPanel({ onNavigateToPatients }: RecordsPanelProps): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-am-doctor-50 to-am-primary-50 ring-1 ring-am-doctor-200">
            <FileText className="h-5 w-5 text-am-doctor-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-am-surface-900">Historiales Médicos</h1>
            <p className="text-sm text-am-surface-500">Registros médicos de tus pacientes</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-am-surface-200 bg-white px-4 py-2.5 text-sm font-medium text-am-surface-700 shadow-am-xs transition-all duration-am-fast hover:bg-am-surface-50 hover:border-am-surface-300 hover:text-am-surface-900 active:scale-95"
          >
            <Search className="h-4 w-4" />
            Buscar
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-am-doctor-600 to-am-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-am-doctor-500/20 transition-all duration-am-fast hover:-translate-y-0.5 hover:shadow-am-doctor active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Nuevo Registro
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center rounded-2xl border border-am-surface-200 bg-white shadow-am-sm">
        <div className="flex flex-col items-center text-center max-w-md px-6 py-12">
          <div className="relative mb-6">
            <div className="absolute -inset-6 rounded-full bg-am-doctor-50/60" />
            <div className="absolute -inset-3 rounded-full bg-am-doctor-50" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-am-doctor-500 to-am-primary-600 shadow-lg shadow-am-doctor-500/20">
              <FileText className="h-7 w-7 text-white" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-am-surface-900">Sin registros médicos</h3>
          <p className="mt-2 text-sm text-am-surface-500">
            Selecciona un paciente para ver y gestionar sus registros médicos.
          </p>
          {onNavigateToPatients && (
            <button
              type="button"
              onClick={onNavigateToPatients}
              className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-r from-am-doctor-600 to-am-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-am-doctor-500/20 transition-all duration-am-fast hover:-translate-y-0.5 active:scale-95"
            >
              <Users className="h-4 w-4" />
              Ir a Pacientes
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
