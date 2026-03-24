'use client'

import { useRealDoctors } from '@/hooks/doctors/useRealDoctors'
import type { DoctorWithProfile } from '@autamedica/types'
import { MEDICAL_SPECIALTIES } from '@autamedica/types'
import {
  AlertCircle,
  List,
  Loader2,
  Map,
  MapPin,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { GoogleMapsView } from './GoogleMapsView'

function getDoctorName(doctor: DoctorWithProfile): string {
  const profile = doctor.profile as { first_name?: string; last_name?: string } | null
  if (!profile) return 'Profesional'
  const parts = [profile.first_name, profile.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Profesional'
}

export function MarketplacePanel() {
  const { doctors, loading, error } = useRealDoctors()
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSpecialty, setSelectedSpecialty] = useState('all')

  const apiKey = import.meta.env.PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

  const filtered = useMemo(() => {
    if (!doctors) return []
    return doctors.filter(d => {
      const name = getDoctorName(d).toLowerCase()
      const matchesSearch = !searchTerm || name.includes(searchTerm.toLowerCase())
        || (d.specialty?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
      const matchesSpecialty = selectedSpecialty === 'all' || d.specialty === selectedSpecialty
      return matchesSearch && matchesSpecialty
    })
  }, [doctors, searchTerm, selectedSpecialty])

  const specialtyValues = Object.values(MEDICAL_SPECIALTIES)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-am-surface-50 text-am-surface-900">
      {/* Header */}
      <div className="shrink-0 border-b border-am-surface-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-am-primary-50 p-2">
              <MapPin className="h-6 w-6 text-am-primary-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-am-surface-900">Cobertura Médica</h1>
              <p className="text-sm text-am-surface-500">
                Profesionales activos en la plataforma
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-am-primary-50 px-3 py-1 text-sm text-am-primary-700">
              <Users className="h-3.5 w-3.5" />
              {filtered.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('list')}
                className={`rounded-lg p-2 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-am-primary-600 text-white'
                    : 'border border-am-surface-200 bg-white text-am-surface-700 hover:bg-am-surface-100'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`rounded-lg p-2 transition-colors ${
                  viewMode === 'map'
                    ? 'bg-am-primary-600 text-white'
                    : 'border border-am-surface-200 bg-white text-am-surface-700 hover:bg-am-surface-100'
                }`}
              >
                <Map className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-am-surface-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o especialidad..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-am-surface-200 bg-white py-2 pl-10 pr-4 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-primary-500"
            />
          </div>
          <select
            value={selectedSpecialty}
            onChange={e => setSelectedSpecialty(e.target.value)}
            className="rounded-lg border border-am-surface-200 bg-white px-3 py-2 text-sm text-am-surface-900 focus:outline-none focus:ring-2 focus:ring-am-primary-500"
          >
            <option value="all">Todas las especialidades</option>
            {specialtyValues.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-am-primary-500" />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
              <p className="text-sm text-am-surface-500">{error}</p>
            </div>
          </div>
        ) : viewMode === 'map' ? (
          <div className="flex-1 p-4">
            <GoogleMapsView doctors={filtered} apiKey={apiKey} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Stethoscope className="mx-auto mb-3 h-10 w-10 text-am-surface-400" />
              <p className="text-sm font-medium text-am-surface-700">Sin resultados</p>
              <p className="mt-1 text-xs text-am-surface-500">
                No se encontraron profesionales con esos filtros
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(doctor => (
                <DoctorCard key={doctor.id} doctor={doctor} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DoctorCard({ doctor }: { doctor: DoctorWithProfile }) {
  const name = getDoctorName(doctor)

  return (
    <div className="rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-am-card-hover">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-am-primary-50 text-sm font-semibold text-am-primary-700">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-am-surface-900">{name}</p>
          <p className="text-sm text-am-surface-500">
            {doctor.specialty ?? 'Sin especialidad'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-am-surface-500">
        {doctor.years_experience != null && doctor.years_experience > 0 && (
          <span className="rounded-full bg-am-surface-100 px-2 py-0.5">
            {doctor.years_experience} años exp.
          </span>
        )}
        {doctor.subspecialty && (
          <span className="rounded-full bg-am-primary-50 px-2 py-0.5 text-am-primary-700">
            {doctor.subspecialty}
          </span>
        )}
        {Array.isArray(doctor.languages) && doctor.languages.length > 0 && (
          <span className="rounded-full bg-am-surface-100 px-2 py-0.5">
            {doctor.languages.join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}
