/**
 * Componente de información del paciente para el portal de médicos
 */

'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import type { UUID } from '@/types/medical'
import {
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Heart,
  AlertTriangle,
  Shield,
  Edit3,
  X
} from 'lucide-react'
import { usePatientData } from '@/hooks/doctors/usePatientData'

interface PatientInfoTabProps {
  patientId: UUID | null
}

type PatientInfoData = {
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  age?: number | null
  gender?: string | null
  blood_type?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  allergies?: string[] | string | null
  chronic_conditions?: string[] | string | null
  insurance_provider?: string | null
  insurance_number?: string | null
  date_of_birth?: string | null
  created_at?: string | null
}

function parseList(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }
  return []
}

function formatDisplayDate(dateValue: string | null | undefined): string {
  if (!dateValue) {
    return 'No registrado'
  }
  return new Date(dateValue).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export function PatientInfoTab({ patientId }: PatientInfoTabProps): JSX.Element {
  const { patient, loading, error, refresh } = usePatientData(patientId)
  const [isEditing, setIsEditing] = useState(false)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-gray-500">Cargando información del paciente...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Error al cargar datos</h3>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={refresh}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!patient && !patientId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Sin paciente seleccionado</h3>
          <p className="text-gray-500">Selecciona un paciente para ver su información</p>
        </div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Paciente no encontrado</h3>
          <p className="text-gray-500">No se pudo cargar la información del paciente</p>
        </div>
      </div>
    )
  }

  const patientData = patient as unknown as PatientInfoData
  const patientInitials = `${patientData.first_name?.[0] ?? ''}${patientData.last_name?.[0] ?? ''}`.trim() || 'P'
  const patientName =
    patientData.full_name
    || `${patientData.first_name ?? ''} ${patientData.last_name ?? ''}`.trim()
    || 'Paciente'
  const patientAllergies = parseList(patientData.allergies)
  const patientChronicConditions = parseList(patientData.chronic_conditions)

  return (
    <div className="h-full overflow-y-auto bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header con información básica */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white">
                {patientInitials}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{patientName}</h1>
                <p className="text-gray-500">{patientData.age ?? '—'} años • {patientData.gender ?? 'No especificado'}</p>
                <div className="mt-1 flex items-center gap-2 text-sm text-blue-600">
                  <Heart className="h-4 w-4" />
                  <span>Tipo de sangre: {patientData.blood_type ?? 'No registrado'}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              {isEditing ? (
                <>
                  <X className="h-4 w-4" />
                  Cancelar
                </>
              ) : (
                <>
                  <Edit3 className="h-4 w-4" />
                  Editar
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">

          {/* Información de contacto */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Phone className="h-5 w-5 text-blue-600" />
              Información de Contacto
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Teléfono</p>
                  <p className="text-gray-500">{patientData.phone || 'No registrado'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Email</p>
                  <p className="text-gray-500">{patientData.email || 'No registrado'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-gray-500 mt-1" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Dirección</p>
                  <p className="text-gray-500">{patientData.address || 'No registrada'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contacto de emergencia */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              Contacto de Emergencia
            </h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Nombre</p>
                <p className="text-gray-500">{patientData.emergency_contact_name || 'No registrado'}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">Teléfono</p>
                <p className="text-gray-500">{patientData.emergency_contact_phone || 'No registrado'}</p>
              </div>
            </div>
          </div>

          {/* Información médica */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Heart className="h-5 w-5 text-red-400" />
              Información Médica
            </h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Alergias</p>
                {patientAllergies.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patientAllergies.map((allergy, index) => (
                      <span
                        key={index}
                        className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 border border-red-200"
                      >
                        {allergy}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">Sin alergias conocidas</p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Condiciones Crónicas</p>
                {patientChronicConditions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patientChronicConditions.map((condition, index) => (
                      <span
                        key={index}
                        className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 border border-yellow-200"
                      >
                        {condition}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">Sin condiciones crónicas</p>
                )}
              </div>
            </div>
          </div>

          {/* Información del seguro */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Shield className="h-5 w-5 text-blue-400" />
              Información del Seguro
            </h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Proveedor</p>
                <p className="text-gray-500">{patientData.insurance_provider || 'No registrado'}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">Número de póliza</p>
                <p className="text-gray-500 font-mono">
                  {patientData.insurance_number || 'No registrado'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Información adicional */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Calendar className="h-5 w-5 text-blue-600" />
            Información del Registro
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-gray-700">Fecha de nacimiento</p>
              <p className="text-gray-500">{formatDisplayDate(patientData.date_of_birth)}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Registrado</p>
              <p className="text-gray-500">{formatDisplayDate(patientData.created_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
