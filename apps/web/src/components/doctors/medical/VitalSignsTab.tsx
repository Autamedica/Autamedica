
// @ts-nocheck
/**
 * Componente de signos vitales para el portal de médicos
 */

'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import { formatDateTime } from '@/lib/date-utils'
import {
  Activity,
  Heart,
  Thermometer,
  Wind,
  Scale,
  Ruler,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Calendar,
  Edit3,
  BarChart3
} from 'lucide-react'
import { useVitalSigns } from '@/hooks/doctors/useVitalSigns'

interface VitalSignsTabProps {
  patientId: string | null
}

const VITAL_SIGNS_RANGES = {
  blood_pressure_systolic: { min: 90, max: 120, unit: 'mmHg', label: 'Presion sistolica' },
  blood_pressure_diastolic: { min: 60, max: 80, unit: 'mmHg', label: 'Presion diastolica' },
  heart_rate: { min: 60, max: 100, unit: 'BPM', label: 'Frecuencia cardiaca' },
  temperature: { min: 36.1, max: 37.5, unit: '°C', label: 'Temperatura' },
  oxygen_saturation: { min: 95, max: 100, unit: '%', label: 'Saturacion de oxigeno' },
  respiratory_rate: { min: 12, max: 20, unit: '/min', label: 'Frecuencia respiratoria' },
  weight: { min: null, max: null, unit: 'kg', label: 'Peso' },
  height: { min: null, max: null, unit: 'cm', label: 'Altura' },
  bmi: { min: 18.5, max: 24.9, unit: '', label: 'IMC' }
}

export function VitalSignsTab({ patientId }: VitalSignsTabProps): JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const { vitalSigns, loading, error, addVitalSigns: _addVitalSigns, latest } = useVitalSigns(patientId)

  const getVitalSignStatus = (value: number | null, key: keyof typeof VITAL_SIGNS_RANGES): 'normal' | 'low' | 'high' | 'unknown' => {
    if (value === null) return 'unknown'

    const range = VITAL_SIGNS_RANGES[key]
    if (range.min === null || range.max === null) return 'normal'

    if (value < range.min) return 'low'
    if (value > range.max) return 'high'
    return 'normal'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'text-green-700'
      case 'low': return 'text-am-doctor-600'
      case 'high': return 'text-red-600'
      default: return 'text-am-surface-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'high': return <TrendingUp className="h-4 w-4" />
      case 'low': return <TrendingDown className="h-4 w-4" />
      case 'normal': return <Minus className="h-4 w-4" />
      default: return null
    }
  }

  const calculateBMICategory = (bmi: number | null): string => {
    if (!bmi) return 'No calculado'
    if (bmi < 18.5) return 'Bajo peso'
    if (bmi < 25) return 'Peso normal'
    if (bmi < 30) return 'Sobrepeso'
    return 'Obesidad'
  }

  if (loading && vitalSigns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-am-doctor-600 border-t-transparent mx-auto"></div>
          <p className="text-am-surface-500">Cargando signos vitales...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-am-surface-800 mb-2">Error al cargar signos vitales</h3>
          <p className="text-am-surface-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!patientId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Activity className="h-16 w-16 text-am-surface-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-am-surface-800 mb-2">Sin paciente seleccionado</h3>
          <p className="text-am-surface-500">Selecciona un paciente para ver sus signos vitales</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-am-surface-50">

      {/* Header */}
      <div className="border-b border-am-surface-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-am-surface-900">Signos Vitales</h1>
            <p className="text-sm text-am-surface-500">
              {vitalSigns.length} registro{vitalSigns.length !== 1 ? 's' : ''} •
              {latest && ` Ultimo: ${formatDateTime(latest.recorded_at)}`}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-lg border border-am-doctor-600 bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white hover:bg-am-doctor-700 transition"
            >
              <Plus className="h-4 w-4" />
              Nuevo Registro
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-am-surface-200 bg-white px-4 py-2 text-sm text-am-surface-700 hover:bg-am-surface-100 transition shadow-am-sm">
              <BarChart3 className="h-4 w-4" />
              Graficos
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {vitalSigns.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Activity className="h-16 w-16 text-am-surface-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-am-surface-800 mb-2">Sin registros de signos vitales</h3>
              <p className="text-am-surface-500 mb-4">Este paciente aun no tiene registros de signos vitales</p>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 rounded-lg bg-am-doctor-600 px-4 py-2 text-sm font-medium text-white hover:bg-am-doctor-700 transition mx-auto"
              >
                <Plus className="h-4 w-4" />
                Primer Registro
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Resumen de ultimos signos vitales */}
            {latest && (
              <div className="rounded-2xl border border-am-surface-200 bg-white p-6 shadow-am-sm">
                <h2 className="text-lg font-semibold text-am-surface-900 mb-4">Ultimos Signos Vitales</h2>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Presion arterial */}
                  <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 shadow-am-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Heart className="h-5 w-5 text-red-600" />
                      <div className="flex items-center gap-1">
                        {getStatusIcon(getVitalSignStatus(latest.blood_pressure_systolic, 'blood_pressure_systolic'))}
                        {getStatusIcon(getVitalSignStatus(latest.blood_pressure_diastolic, 'blood_pressure_diastolic'))}
                      </div>
                    </div>
                    <p className="text-xs text-am-surface-500 mb-1">Presion Arterial</p>
                    <p className="text-lg font-semibold text-am-surface-900">
                      {latest.blood_pressure_systolic || '--'}/{latest.blood_pressure_diastolic || '--'}
                      <span className="text-sm text-am-surface-500 ml-1">mmHg</span>
                    </p>
                  </div>

                  {/* Frecuencia cardiaca */}
                  <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 shadow-am-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Activity className="h-5 w-5 text-am-doctor-600" />
                      <div className={getStatusColor(getVitalSignStatus(latest.heart_rate, 'heart_rate'))}>
                        {getStatusIcon(getVitalSignStatus(latest.heart_rate, 'heart_rate'))}
                      </div>
                    </div>
                    <p className="text-xs text-am-surface-500 mb-1">Frecuencia Cardiaca</p>
                    <p className="text-lg font-semibold text-am-surface-900">
                      {latest.heart_rate || '--'}
                      <span className="text-sm text-am-surface-500 ml-1">BPM</span>
                    </p>
                  </div>

                  {/* Temperatura */}
                  <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 shadow-am-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Thermometer className="h-5 w-5 text-orange-700" />
                      <div className={getStatusColor(getVitalSignStatus(latest.temperature, 'temperature'))}>
                        {getStatusIcon(getVitalSignStatus(latest.temperature, 'temperature'))}
                      </div>
                    </div>
                    <p className="text-xs text-am-surface-500 mb-1">Temperatura</p>
                    <p className="text-lg font-semibold text-am-surface-900">
                      {latest.temperature || '--'}
                      <span className="text-sm text-am-surface-500 ml-1">°C</span>
                    </p>
                  </div>

                  {/* Saturacion de oxigeno */}
                  <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 shadow-am-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Wind className="h-5 w-5 text-am-doctor-500" />
                      <div className={getStatusColor(getVitalSignStatus(latest.oxygen_saturation, 'oxygen_saturation'))}>
                        {getStatusIcon(getVitalSignStatus(latest.oxygen_saturation, 'oxygen_saturation'))}
                      </div>
                    </div>
                    <p className="text-xs text-am-surface-500 mb-1">Saturacion O2</p>
                    <p className="text-lg font-semibold text-am-surface-900">
                      {latest.oxygen_saturation || '--'}
                      <span className="text-sm text-am-surface-500 ml-1">%</span>
                    </p>
                  </div>

                  {/* Medidas corporales */}
                  <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 shadow-am-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Scale className="h-5 w-5 text-purple-500" />
                      <div className={getStatusColor(getVitalSignStatus(latest.bmi, 'bmi'))}>
                        {getStatusIcon(getVitalSignStatus(latest.bmi, 'bmi'))}
                      </div>
                    </div>
                    <p className="text-xs text-am-surface-500 mb-1">Peso / IMC</p>
                    <p className="text-lg font-semibold text-am-surface-900">
                      {latest.weight || '--'}
                      <span className="text-sm text-am-surface-500 ml-1">kg</span>
                    </p>
                    {latest.bmi && (
                      <p className="text-xs text-am-surface-500">
                        IMC: {latest.bmi} ({calculateBMICategory(latest.bmi)})
                      </p>
                    )}
                  </div>

                  {/* Altura */}
                  <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 shadow-am-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Ruler className="h-5 w-5 text-yellow-500" />
                    </div>
                    <p className="text-xs text-am-surface-500 mb-1">Altura</p>
                    <p className="text-lg font-semibold text-am-surface-900">
                      {latest.height || '--'}
                      <span className="text-sm text-am-surface-500 ml-1">cm</span>
                    </p>
                  </div>

                  {/* Frecuencia respiratoria */}
                  <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 shadow-am-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Wind className="h-5 w-5 text-cyan-700" />
                      <div className={getStatusColor(getVitalSignStatus(latest.respiratory_rate, 'respiratory_rate'))}>
                        {getStatusIcon(getVitalSignStatus(latest.respiratory_rate, 'respiratory_rate'))}
                      </div>
                    </div>
                    <p className="text-xs text-am-surface-500 mb-1">Freq. Respiratoria</p>
                    <p className="text-lg font-semibold text-am-surface-900">
                      {latest.respiratory_rate || '--'}
                      <span className="text-sm text-am-surface-500 ml-1">/min</span>
                    </p>
                  </div>
                </div>

                {latest.notes && (
                  <div className="mt-4 rounded-lg bg-am-surface-50 p-3">
                    <p className="text-xs text-am-surface-500 mb-1">Notas:</p>
                    <p className="text-sm text-am-surface-700">{latest.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Historial de registros */}
            <div className="rounded-2xl border border-am-surface-200 bg-white p-6 shadow-am-sm">
              <h2 className="text-lg font-semibold text-am-surface-900 mb-4">Historial de Registros</h2>

              <div className="space-y-3">
                {vitalSigns.map((vitals) => (
                  <div
                    key={vitals.id}
                    className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-4 shadow-am-sm"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-am-surface-500" />
                        <span className="text-sm font-medium text-am-surface-700">
                          {formatDateTime(vitals.recorded_at)}
                        </span>
                      </div>
                      <button aria-label="Editar signos vitales" className="rounded-lg border border-am-surface-200 bg-white p-1.5 text-am-surface-700 hover:bg-am-surface-100 transition shadow-am-sm">
                        <Edit3 className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <span className="text-am-surface-500">PA: </span>
                        <span className="text-am-surface-900">
                          {vitals.blood_pressure_systolic || '--'}/{vitals.blood_pressure_diastolic || '--'} mmHg
                        </span>
                      </div>
                      <div>
                        <span className="text-am-surface-500">FC: </span>
                        <span className="text-am-surface-900">{vitals.heart_rate || '--'} BPM</span>
                      </div>
                      <div>
                        <span className="text-am-surface-500">Temp: </span>
                        <span className="text-am-surface-900">{vitals.temperature || '--'} °C</span>
                      </div>
                      <div>
                        <span className="text-am-surface-500">SpO2: </span>
                        <span className="text-am-surface-900">{vitals.oxygen_saturation || '--'} %</span>
                      </div>
                    </div>

                    {vitals.notes && (
                      <div className="mt-2 pt-2 border-t border-am-surface-200">
                        <span className="text-xs text-am-surface-500">Notas: </span>
                        <span className="text-xs text-am-surface-700">{vitals.notes}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
