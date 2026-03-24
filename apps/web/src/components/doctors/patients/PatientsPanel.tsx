"use client"

import { createBrowserClient } from '@autamedica/auth/client'
import { usePatients } from '@autamedica/hooks'
import type { Patient } from '@autamedica/types'
import {
  Activity,
  Calendar,
  ChevronRight,
  Clock,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?'
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return ''
  try {
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(dateStr))
  } catch {
    return ''
  }
}

const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-pink-600',
  'from-lime-500 to-green-600',
] as const

function PatientSkeleton(): JSX.Element {
  return (
    <div className="space-y-px">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-5 py-4 animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="h-11 w-11 rounded-xl bg-am-surface-200" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 w-40 rounded-md bg-am-surface-200" />
            <div className="flex gap-4">
              <div className="h-3 w-32 rounded-md bg-am-surface-100" />
              <div className="h-3 w-24 rounded-md bg-am-surface-100" />
            </div>
          </div>
          <div className="h-7 w-16 rounded-lg bg-am-surface-100" />
        </div>
      ))}
    </div>
  )
}

interface PatientsPanelProps {
  onSelectPatient?: (patientId: string) => void
}

export function PatientsPanel({ onSelectPatient }: PatientsPanelProps): JSX.Element {
  const [supabaseClient, setSupabaseClient] = useState<ReturnType<typeof createBrowserClient> | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSupabaseClient(createBrowserClient())
  }, [])

  // Keyboard shortcut: Cmd/Ctrl + K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearchQuery('')
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const { patients, loading, error, refetch } = usePatients(supabaseClient)

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return patients
    const q = searchQuery.toLowerCase()
    return patients.filter(
      (p) =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.phone?.includes(q),
    )
  }, [patients, searchQuery])

  if (supabaseClient === null || loading) {
    return (
      <div className="flex h-full flex-col gap-5">
        <Header count={0} loading />
        <SearchBar inputRef={searchRef} value="" onChange={() => {}} />
        <div className="flex-1 overflow-hidden rounded-2xl border border-am-surface-200 bg-white shadow-am-sm">
          <PatientSkeleton />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col gap-5">
        <Header count={0} />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 rounded-2xl border border-red-200 bg-red-50 p-10 shadow-am-sm">
          <div className="relative">
            <div className="absolute -inset-3 animate-pulse rounded-full bg-red-100" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 ring-1 ring-red-200">
              <ShieldAlert className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <div className="max-w-sm text-center">
            <h3 className="text-sm font-semibold text-red-800">
              No se pudieron cargar los pacientes
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-red-600">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="group mt-1 flex items-center gap-2 rounded-xl bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200 transition-all hover:bg-red-100 hover:ring-red-300 active:scale-[0.97]"
          >
            <RefreshCw className="h-4 w-4 transition-transform group-hover:rotate-180" />
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-5">
      <Header count={patients.length} />
      <SearchBar inputRef={searchRef} value={searchQuery} onChange={setSearchQuery} />

      <div className="flex-1 overflow-hidden rounded-2xl border border-am-surface-200 bg-white shadow-am-sm">
        {filtered.length === 0 ? (
          searchQuery ? (
            <EmptySearch query={searchQuery} onClear={() => setSearchQuery('')} />
          ) : (
            <EmptyState />
          )
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="px-5 py-2.5">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-am-surface-400">
                <span>{filtered.length} paciente{filtered.length !== 1 ? 's' : ''}</span>
                {searchQuery && (
                  <>
                    <span className="h-0.5 w-0.5 rounded-full bg-am-surface-400" />
                    <span>filtrados</span>
                  </>
                )}
              </div>
            </div>
            <div className="divide-y divide-am-surface-100">
              {filtered.map((patient) => (
                <PatientRow key={patient.id} patient={patient} onSelect={onSelectPatient} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Header({ count, loading }: { count: number; loading?: boolean }): JSX.Element {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3.5">
        <div className="relative">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-am-doctor-50 ring-1 ring-am-doctor-200">
            <Users className="h-5 w-5 text-am-doctor-600" />
          </div>
          {!loading && count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-am-doctor-600 px-1 text-[10px] font-bold text-white shadow-lg shadow-am-doctor-500/15">
              {count}
            </span>
          )}
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-am-surface-900">Mis Pacientes</h1>
          <p className="text-xs text-am-surface-400">
            {loading ? 'Cargando...' : count > 0 ? 'Gestión de pacientes asignados' : 'Panel de pacientes'}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="group flex items-center gap-2 rounded-xl bg-am-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-am-primary-500/15 transition-all duration-am-fast ease-am-ease hover:bg-am-primary-700 hover:shadow-am-primary-500/25 active:scale-[0.97]"
      >
        <UserPlus className="h-4 w-4 transition-transform group-hover:scale-110" />
        Nuevo Paciente
      </button>
    </div>
  )
}

function SearchBar({
  inputRef,
  value,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-am-surface-400" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar paciente..."
        className="w-full rounded-xl border border-am-surface-300 bg-white py-3 pl-11 pr-20 text-sm text-am-surface-800 placeholder:text-am-surface-400 outline-none transition-all duration-am-fast ease-am-ease focus:border-am-doctor-400 focus:bg-white focus:shadow-lg focus:shadow-am-doctor-500/5 focus:ring-1 focus:ring-am-doctor-400"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-am-surface-400 transition-all duration-am-fast ease-am-ease hover:bg-am-surface-100 hover:text-am-surface-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="absolute right-3.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-am-surface-200 bg-am-surface-50 px-1.5 py-0.5 text-[10px] font-medium text-am-surface-400 sm:flex">
          <span className="text-[9px]">⌘</span>K
        </kbd>
      )}
    </div>
  )
}

function PatientRow({ patient, onSelect }: { patient: Patient; onSelect?: (id: string) => void }): JSX.Element {
  const initials = getInitials(patient.firstName, patient.lastName)
  const colorIdx = patient.id.charCodeAt(0) % AVATAR_GRADIENTS.length
  const gradient = AVATAR_GRADIENTS[colorIdx]
  const memberSince = formatDate(patient.createdAt)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(patient.id)}
      className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-all duration-am-fast ease-am-ease hover:bg-am-surface-50 active:bg-am-surface-100"
    >
      <div className="relative">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-sm font-semibold text-white shadow-am-sm transition-transform group-hover:scale-105`}
        >
          {initials}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <p className="truncate text-sm font-medium text-am-surface-900 transition-colors group-hover:text-am-surface-900">
            {patient.firstName} {patient.lastName}
          </p>
          {patient.gender && (
            <span className="rounded-md bg-am-surface-100 px-1.5 py-0.5 text-[10px] font-medium text-am-surface-500">
              {patient.gender === 'male' ? 'M' : patient.gender === 'female' ? 'F' : 'O'}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-am-surface-500">
          {patient.email && (
            <span className="flex items-center gap-1.5 truncate">
              <Mail className="h-3 w-3 shrink-0 text-am-surface-400" />
              <span className="truncate">{patient.email}</span>
            </span>
          )}
          {patient.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0 text-am-surface-400" />
              {patient.phone}
            </span>
          )}
          {memberSince && (
            <span className="hidden items-center gap-1.5 lg:flex">
              <Clock className="h-3 w-3 shrink-0 text-am-surface-400" />
              {memberSince}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <span
          className="rounded-lg p-2 text-am-surface-400 transition-all duration-am-fast ease-am-ease hover:bg-am-surface-100 hover:text-am-doctor-600"
          title="Historial médico"
        >
          <FileText className="h-4 w-4" />
        </span>
        <span
          className="rounded-lg p-2 text-am-surface-400 transition-all duration-am-fast ease-am-ease hover:bg-am-surface-100 hover:text-am-doctor-600"
          title="Agendar cita"
        >
          <Calendar className="h-4 w-4" />
        </span>
        <span
          className="rounded-lg p-2 text-am-surface-400 transition-all duration-am-fast ease-am-ease hover:bg-am-surface-100 hover:text-am-doctor-600"
          title="Signos vitales"
        >
          <Activity className="h-4 w-4" />
        </span>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-am-surface-300 transition-all duration-am-fast ease-am-ease group-hover:translate-x-0.5 group-hover:text-am-surface-500" />
    </button>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-10 text-center">
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-am-doctor-50" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-am-surface-100 ring-1 ring-am-surface-200">
          <Users className="h-9 w-9 text-am-surface-400" />
        </div>
      </div>
      <div className="max-w-xs">
        <h3 className="text-sm font-semibold text-am-surface-800">Sin pacientes asignados</h3>
        <p className="mt-2 text-xs leading-relaxed text-am-surface-500">
          Los pacientes aparecerán aquí cuando estén vinculados a tu perfil médico
        </p>
      </div>
      <button
        type="button"
        className="group flex items-center gap-2 rounded-xl bg-am-doctor-50 px-5 py-2.5 text-sm font-medium text-am-doctor-600 ring-1 ring-am-doctor-200 transition-all duration-am-fast ease-am-ease hover:bg-am-doctor-100 hover:ring-am-doctor-300 active:scale-[0.97]"
      >
        <UserPlus className="h-4 w-4 transition-transform group-hover:scale-110" />
        Agregar Paciente
      </button>
    </div>
  )
}

function EmptySearch({ query, onClear }: { query: string; onClear: () => void }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-am-surface-100 ring-1 ring-am-surface-200">
        <Search className="h-7 w-7 text-am-surface-400" />
      </div>
      <div className="max-w-xs">
        <p className="text-sm text-am-surface-500">
          Sin resultados para{' '}
          <span className="font-semibold text-am-surface-800">&ldquo;{query}&rdquo;</span>
        </p>
        <p className="mt-1 text-xs text-am-surface-400">Intenta con otro nombre, email o teléfono</p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="flex items-center gap-1.5 text-xs font-medium text-am-doctor-600 transition-all duration-am-fast ease-am-ease hover:text-am-doctor-700"
      >
        <X className="h-3 w-3" />
        Limpiar búsqueda
      </button>
    </div>
  )
}
