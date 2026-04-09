/**
 * Componente de historial médico para el portal de médicos
 */

'use client'

import { formatDateTime } from '@/lib/date-utils'
import { useMedicalHistory } from '@/hooks/doctors/useMedicalHistory'
import type { ConsultationType, UUID } from '@/types/medical'
import {
    AlertTriangle,
    Calendar,
    ChevronDown,
    Download,
    Eye,
    FileText,
    Plus,
    Search,
    Stethoscope
} from 'lucide-react'
import type { JSX } from 'react'
import { useState } from 'react'
import { NeuroStabilityCard } from './NeuroStabilityCard'
import type { NeuroStabilityReportContent } from '@/lib/patients/verticals/neuro/scoring.engine'

interface MedicalHistoryTabProps {
  patientId: UUID | null
}

const CONSULTATION_TYPES: { value: ConsultationType; label: string; color: string }[] = [
  { value: 'general', label: 'General', color: 'bg-am-doctor-50 text-am-doctor-700 border-am-doctor-200' },
  { value: 'seguimiento', label: 'Seguimiento', color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'urgencia', label: 'Urgencia', color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'especialidad', label: 'Especialidad', color: 'bg-purple-50 text-purple-700 border-purple-200' }
]

const DEFAULT_CONSULTATION_TYPE = {
  value: 'general' as ConsultationType,
  label: 'General',
  color: 'bg-am-doctor-50 text-am-doctor-700 border-am-doctor-200'
}

export function MedicalHistoryTab({ patientId }: MedicalHistoryTabProps): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState<ConsultationType | ''>('')
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null)

  const { records, loading, error, loadMore, hasMore } = useMedicalHistory(patientId, {
    filters: {
      consultation_type: selectedType || undefined,
      diagnosis_contains: searchTerm || undefined
    }
  })

  const getConsultationTypeInfo = (type: ConsultationType) => {
    return CONSULTATION_TYPES.find(t => t.value === type) ?? DEFAULT_CONSULTATION_TYPE
  }

  if (loading && records.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-am-doctor-600 border-t-transparent mx-auto"></div>
          <p className="text-am-surface-500">Cargando historial médico...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-am-surface-800 mb-2">Error al cargar historial</h3>
          <p className="text-am-surface-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!patientId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText className="h-16 w-16 text-am-surface-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-am-surface-800 mb-2">Sin paciente seleccionado</h3>
          <p className="text-am-surface-500">Selecciona un paciente para ver su historial médico</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-am-surface-50">

      {/* Header con controles */}
      <div className="border-b border-am-surface-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-am-surface-900">Historial Médico</h1>
            <p className="text-sm text-am-surface-500">
              {records.length} registro{records.length !== 1 ? 's' : ''} encontrado{records.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex gap-3">
            <button className="flex items-center gap-2 rounded-lg border border-am-doctor-600 bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white hover:bg-am-doctor-700 transition">
              <Plus className="h-4 w-4" />
              Nueva Consulta
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-am-surface-200 bg-white px-4 py-2 text-sm text-am-surface-700 shadow-am-sm hover:bg-am-surface-100 transition">
              <Download className="h-4 w-4" />
              Exportar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-am-surface-400" />
            <input
              type="text"
              placeholder="Buscar por diagnóstico, síntomas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-am-surface-200 bg-white pl-10 pr-4 py-2 text-sm text-am-surface-900 shadow-am-sm placeholder:text-am-surface-400 focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as ConsultationType | '')}
            className="rounded-lg border border-am-surface-200 bg-white px-3 py-2 text-sm text-am-surface-900 shadow-am-sm focus:border-am-doctor-500 focus:outline-none focus:ring-1 focus:ring-am-doctor-500"
          >
            <option value="">Todos los tipos</option>
            {CONSULTATION_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de registros */}
      <div className="flex-1 overflow-y-auto p-6">
        {records.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <FileText className="h-16 w-16 text-am-surface-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-am-surface-800 mb-2">Sin registros médicos</h3>
              <p className="text-am-surface-500 mb-4">
                {searchTerm || selectedType
                  ? 'No se encontraron registros con los filtros aplicados'
                  : 'Este paciente aún no tiene registros médicos'
                }
              </p>
              <button className="flex items-center gap-2 rounded-lg bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white hover:bg-am-doctor-700 transition mx-auto">
                <Plus className="h-4 w-4" />
                Crear Primera Consulta
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((record) => {
              const typeInfo = getConsultationTypeInfo(record.consultation_type)
              const isExpanded = expandedRecord === record.id

              if (record.type === 'neuro_stability_report') {
                const content = record.content as unknown as NeuroStabilityReportContent
                return (
                  <div key={record.id} className="space-y-2">
                    <NeuroStabilityCard
                      score={content.score}
                      reasons={content.reasons || []}
                      vitals={content.vitals_snapshot as { bloodPressure?: string; heartRate?: number; weight?: number }}
                      dateRecorded={record.consultation_date || record.created_at}
                    />
                  </div>
                )
              }

              return (
                <div
                  key={record.id}
                  className="rounded-2xl border border-am-surface-200 bg-white shadow-am-sm overflow-hidden"
                >
                  {/* Header del registro */}
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${typeInfo.color}`}>
                          <Stethoscope className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-am-surface-900 uppercase tracking-tight">
                            {typeInfo.label}
                          </h3>
                          <div className="flex items-center gap-2 text-[10px] text-am-surface-500 font-medium">
                            <Calendar className="h-3 w-3" />
                            {formatDateTime(record.consultation_date || record.created_at)}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
                        className="p-2 rounded-lg hover:bg-am-surface-50 text-am-surface-400 transition"
                      >
                        <ChevronDown className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs font-semibold text-am-surface-700 line-clamp-1">
                        {record.diagnosis || 'Sin diagnóstico registrado'}
                      </p>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div className="border-t border-am-surface-100 bg-am-surface-50/50 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[10px] font-bold text-am-surface-400 uppercase mb-1 tracking-wider">
                            Motivo de Consulta
                          </h4>
                          <p className="text-xs text-am-surface-700 leading-relaxed">
                            {record.chief_complaint || 'No especificado'}
                          </p>
                        </div>

                        <div>
                          <h4 className="text-[10px] font-bold text-am-surface-400 uppercase mb-1 tracking-wider">
                            Plan y Tratamiento
                          </h4>
                          <p className="text-xs text-am-surface-700 leading-relaxed">
                            {record.treatment_plan || 'Sin plan registrado'}
                          </p>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-am-doctor-600 hover:bg-am-doctor-50 transition uppercase tracking-wider border border-am-doctor-100">
                            <Eye className="h-3 w-3" />
                            Ver Detalles
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {hasMore && (
              <button
                onClick={() => loadMore()}
                className="w-full py-3 text-sm font-medium text-am-doctor-600 hover:bg-am-doctor-50 rounded-xl transition border border-dashed border-am-doctor-200"
              >
                Cargar más registros
              </button>
            )}
          </div>
        )
        }
      </div>
    </div>
  )
}
