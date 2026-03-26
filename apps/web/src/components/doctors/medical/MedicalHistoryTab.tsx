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

              return (
                <div
                  key={record.id}
                  className="rounded-2xl border border-am-surface-200 bg-white shadow-am-sm overflow-hidden"
                >
                  {/* Header del registro */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-medium border ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-am-surface-500">
                            <Calendar className="h-3 w-3" />
                            {formatDateTime(record.consultation_date, { month: 'long' })}
                          </div>
                        </div>

                        <h3 className="text-lg font-semibold text-am-surface-900 mb-2">
                          {record.chief_complaint}
                        </h3>

                        <div className="flex items-center gap-4 text-sm text-am-surface-500">
                          <div className="flex items-center gap-1">
                            <Stethoscope className="h-4 w-4" />
                            <span>Diagnóstico: {record.diagnosis}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
                        className="flex items-center gap-2 rounded-lg border border-am-surface-200 bg-white px-3 py-2 text-sm text-am-surface-700 shadow-am-sm hover:bg-am-surface-100 transition"
                      >
                        <Eye className="h-4 w-4" />
                        {isExpanded ? 'Ocultar' : 'Ver detalles'}
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Contenido expandido */}
                  {isExpanded && (
                    <div className="border-t border-am-surface-200 bg-am-surface-50 p-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-semibold text-am-surface-700 mb-2">Síntomas</h4>
                          <div className="flex flex-wrap gap-2">
                            {record.symptoms.map((symptom, index) => (
                              <span
                                key={index}
                                className="rounded-lg bg-am-surface-100 px-2 py-1 text-xs text-am-surface-700"
                              >
                                {symptom}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-semibold text-am-surface-700 mb-2">Plan de Tratamiento</h4>
                          <p className="text-sm text-am-surface-500">{record.treatment_plan}</p>
                        </div>

                        {record.follow_up_instructions && (
                          <div className="lg:col-span-2">
                            <h4 className="text-sm font-semibold text-am-surface-700 mb-2">Instrucciones de Seguimiento</h4>
                            <p className="text-sm text-am-surface-500">{record.follow_up_instructions}</p>
                          </div>
                        )}

                        {record.attachments.length > 0 && (
                          <div className="lg:col-span-2">
                            <h4 className="text-sm font-semibold text-am-surface-700 mb-2">Archivos Adjuntos</h4>
                            <div className="space-y-2">
                              {record.attachments.map((attachment) => (
                                <div
                                  key={attachment.id}
                                  className="flex items-center gap-3 rounded-lg border border-am-surface-200 bg-white p-3"
                                >
                                  <FileText className="h-4 w-4 text-am-surface-400" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-am-surface-700">{attachment.file_name}</p>
                                    <p className="text-xs text-am-surface-500">
                                      {(attachment.file_size / 1024).toFixed(1)} KB • {attachment.description}
                                    </p>
                                  </div>
                                  <button className="rounded-lg border border-am-surface-200 bg-white px-3 py-1 text-xs text-am-surface-700 shadow-am-sm hover:bg-am-surface-100 transition">
                                    Descargar
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Botón cargar más */}
            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="rounded-lg border border-am-surface-200 bg-white px-6 py-2 text-sm text-am-surface-700 shadow-am-sm hover:bg-am-surface-100 transition disabled:opacity-50"
                >
                  {loading ? 'Cargando...' : 'Cargar más registros'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
