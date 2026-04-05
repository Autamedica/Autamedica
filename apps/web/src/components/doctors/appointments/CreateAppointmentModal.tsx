'use client'

import { useMemo, useState, useEffect } from 'react'
import { useFocusTrap } from '@/hooks/shared/useFocusTrap'
import type { Appointment } from '@autamedica/types'
import { Calendar, Clock, MapPin, Search, Stethoscope, UserRound, Video, X } from 'lucide-react'
import { useRealPatients } from '@/hooks/doctors/useRealPatients'
import { getDisplayName } from '@/lib/doctors/lib/utils'
import type {
  DoctorAppointmentFormValues,
  DoctorAppointmentType,
} from '@/lib/doctors/types/appointments'

interface CreateAppointmentModalProps {
  onClose: () => void
  onSaved: (values: DoctorAppointmentFormValues) => Promise<void>
  appointment?: Appointment
}

const APPOINTMENT_TYPES: Array<{
  value: DoctorAppointmentType
  label: string
  description: string
  icon: typeof Video
}> = [
  {
    value: 'telemedicine',
    label: 'Telemedicina',
    description: 'Videoconsulta con enlace canonico',
    icon: Video,
  },
  {
    value: 'consultation',
    label: 'Consulta',
    description: 'Consulta medica general',
    icon: Stethoscope,
  },
  {
    value: 'follow_up',
    label: 'Seguimiento',
    description: 'Control posterior de evolucion',
    icon: Clock,
  },
  {
    value: 'emergency',
    label: 'Urgencia',
    description: 'Turno priorizado para resolucion rapida',
    icon: Calendar,
  },
]

function getInitialDate(iso?: string): string {
  if (iso) return new Date(iso).toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function getInitialTime(iso?: string): string {
  if (iso) return new Date(iso).toTimeString().slice(0, 5)
  const nextSlot = new Date()
  nextSlot.setMinutes(Math.ceil(nextSlot.getMinutes() / 30) * 30, 0, 0)
  return nextSlot.toTimeString().slice(0, 5)
}

export function CreateAppointmentModal({
  onClose,
  onSaved,
  appointment,
}: CreateAppointmentModalProps) {
  const isEditing = !!appointment
  const { containerRef } = useFocusTrap({ isOpen: true, onClose })
  const { patients, loading: patientsLoading } = useRealPatients()
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [form, setForm] = useState<DoctorAppointmentFormValues>({
    patientId: appointment?.patient_id ?? '',
    date: getInitialDate(appointment?.start_time),
    time: getInitialTime(appointment?.start_time),
    durationMinutes: appointment?.duration_minutes ?? 30,
    type: (appointment?.type as DoctorAppointmentType) ?? 'consultation',
    notes: appointment?.notes ?? '',
    location: appointment?.location ?? '',
  })

  useEffect(() => {
    if (isEditing && appointment?.patient_id && !search && patients.length > 0) {
      const patient = patients.find(p => p.id === appointment.patient_id)
      if (patient) {
        const { name } = getDisplayName(patient.profile)
        setSearch(name)
      }
    }
  }, [isEditing, appointment?.patient_id, patients, search])

  const filteredPatients = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return patients.slice(0, 12)

    return patients.filter((patient) => {
      const { name } = getDisplayName(patient.profile)
      const email = patient.profile?.email?.toLowerCase() ?? ''
      return name.toLowerCase().includes(term) || email.includes(term)
    })
  }, [patients, search])

  const selectedType = useMemo(
    () => APPOINTMENT_TYPES.find((type) => type.value === form.type) ?? APPOINTMENT_TYPES[1],
    [form.type],
  )

  const handleChange = <K extends keyof DoctorAppointmentFormValues>(
    key: K,
    value: DoctorAppointmentFormValues[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'type' && value === 'telemedicine' ? { location: '' } : {}),
    }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      await onSaved(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la cita')
      setSaving(false)
      return
    }

    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Editar Cita' : 'Programar Cita'}
        className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between border-b border-am-surface-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold text-am-surface-900">
              {isEditing ? 'Editar Cita' : 'Programar Cita'}
            </h2>
            <p className="mt-1 text-sm text-am-surface-500">
              {isEditing 
                ? 'Actualiza los detalles de la cita medica seleccionada.'
                : 'Crea un turno nuevo desde el portal medico y dejalo visible en la agenda del paciente.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-am-surface-200 p-2 text-am-surface-500 transition hover:bg-am-surface-50 hover:text-am-surface-700"
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid flex-1 gap-0 overflow-hidden md:grid-cols-[1.15fr_0.85fr]">
          <section className="flex min-h-0 flex-col border-b border-am-surface-200 md:border-b-0 md:border-r">
            <div className="border-b border-am-surface-100 px-5 py-4 sm:px-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-am-surface-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar paciente por nombre o email"
                  className="w-full rounded-2xl border border-am-surface-200 bg-am-surface-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-am-primary-400 focus:bg-white"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-4">
              <div className="grid gap-2">
                {patientsLoading ? (
                  <div className="rounded-2xl border border-am-surface-200 bg-am-surface-50 px-4 py-5 text-sm text-am-surface-500">
                    Cargando pacientes...
                  </div>
                ) : filteredPatients.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-am-surface-200 px-4 py-8 text-center text-sm text-am-surface-500">
                    No hay pacientes para esa busqueda.
                  </div>
                ) : (
                  filteredPatients.map((patient) => {
                    const { name, isEmail } = getDisplayName(patient.profile)
                    const isSelected = form.patientId === patient.id

                    return (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => handleChange('patientId', patient.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? 'border-am-primary-300 bg-am-primary-50 shadow-am-sm'
                            : 'border-am-surface-200 bg-white hover:border-am-surface-300 hover:bg-am-surface-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 rounded-xl p-2 ${isSelected ? 'bg-white text-am-primary-700' : 'bg-am-surface-100 text-am-surface-500'}`}>
                            <UserRound className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-am-surface-900">{name}</p>
                            <p className="truncate text-xs text-am-surface-500">
                              {isEmail ? 'Paciente sin nombre cargado' : patient.profile?.email ?? 'Sin email'}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </section>

          <section className="min-h-0 overflow-auto px-5 py-5 sm:px-6">
            <div className="space-y-5">
              <div className="rounded-2xl border border-am-primary-100 bg-am-primary-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-am-primary-700">Tipo seleccionado</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="rounded-xl bg-white p-2 text-am-primary-700">
                    <selectedType.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-am-surface-900">{selectedType.label}</p>
                    <p className="text-xs text-am-surface-500">{selectedType.description}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-am-surface-700">Fecha</span>
                  <input
                    type="date"
                    min={isEditing ? undefined : getInitialDate()}
                    value={form.date}
                    onChange={(event) => handleChange('date', event.target.value)}
                    className="w-full rounded-2xl border border-am-surface-200 px-4 py-3 text-sm outline-none transition focus:border-am-primary-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-am-surface-700">Hora</span>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(event) => handleChange('time', event.target.value)}
                    className="w-full rounded-2xl border border-am-surface-200 px-4 py-3 text-sm outline-none transition focus:border-am-primary-400"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-am-surface-700">Duracion</span>
                  <select
                    value={String(form.durationMinutes)}
                    onChange={(event) => handleChange('durationMinutes', Number(event.target.value))}
                    className="w-full rounded-2xl border border-am-surface-200 px-4 py-3 text-sm outline-none transition focus:border-am-primary-400"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-am-surface-700">Modalidad</span>
                  <select
                    value={form.type}
                    onChange={(event) => handleChange('type', event.target.value as DoctorAppointmentType)}
                    className="w-full rounded-2xl border border-am-surface-200 px-4 py-3 text-sm outline-none transition focus:border-am-primary-400"
                  >
                    {APPOINTMENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {form.type !== 'telemedicine' && (
                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-am-surface-700">
                    <MapPin className="h-4 w-4 text-am-surface-400" />
                    Ubicacion
                  </span>
                  <input
                    value={form.location}
                    onChange={(event) => handleChange('location', event.target.value)}
                    placeholder="Consultorio, sede o referencia"
                    className="w-full rounded-2xl border border-am-surface-200 px-4 py-3 text-sm outline-none transition focus:border-am-primary-400"
                  />
                </label>
              )}

              <label className="space-y-2">
                <span className="text-sm font-medium text-am-surface-700">Notas clinicas o motivo</span>
                <textarea
                  rows={5}
                  value={form.notes}
                  onChange={(event) => handleChange('notes', event.target.value)}
                  placeholder="Motivo breve, contexto o preparacion previa"
                  className="w-full rounded-2xl border border-am-surface-200 px-4 py-3 text-sm outline-none transition focus:border-am-primary-400"
                />
              </label>

              {error && (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </section>

          <div className="col-span-full flex flex-col gap-3 border-t border-am-surface-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-am-surface-200 px-5 py-3 text-sm font-medium text-am-surface-700 transition hover:bg-am-surface-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.patientId || !form.date || !form.time}
              className="rounded-2xl bg-am-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-am-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Programar cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
