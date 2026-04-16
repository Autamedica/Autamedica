import type { Appointment } from '@autamedica/types'
"use client"

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Video, User, Plus, Filter } from 'lucide-react'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'
import { resolvePatientNameMap } from '@/lib/doctors/services/appointment.service'
import { getCallWindowStatus } from '@/lib/calls/lib/call-error-messages'
import { CreateAppointmentModal } from './CreateAppointmentModal'
import { AppointmentDetailsPanel } from './AppointmentDetailsPanel'
import type { DoctorAppointmentFormValues } from '@/lib/doctors/types/appointments'

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  confirmed: 'Confirmado',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
  no_show: 'Ausente',
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-am-surface-100 text-am-surface-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-sky-100 text-sky-700',
  completed: 'bg-slate-100 text-slate-700',
  cancelled: 'bg-red-100 text-red-700',
  no_show: 'bg-amber-100 text-amber-700',
}

const TYPE_ICONS: Record<string, typeof Video> = {
  telemedicine: Video,
  consultation: User,
  follow_up: Clock,
  emergency: Calendar,
}

export function AppointmentsPanel() {
  const { user } = useAuthenticatedUser()
  const doctorId = user?.doctorProfileId;
  const {
    appointments,
    loading,
    error,
    createAppointment,
    updateAppointment,
    transitionAppointment,
  } = useDoctorAppointments()

  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming'>('all')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [patientNames, setPatientNames] = useState<Record<string, string>>({})

  // Resolve names
  useEffect(() => {
    if (appointments.length > 0) {
      void resolvePatientNameMap(appointments).then(setPatientNames)
    }
  }, [appointments])

  const filteredAppointments = useMemo(() => {
    let list = [...appointments].sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )

    if (filter === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10)
      list = list.filter(a => a.start_time.startsWith(todayStr))
    } else if (filter === 'upcoming') {
      const now = new Date()
      list = list.filter(a => new Date(a.start_time) >= now)
    }

    return list
  }, [appointments, filter])

  const selectedAppointment = useMemo(() =>
    appointments.find(a => a.id === selectedAppointmentId) ?? null
  , [appointments, selectedAppointmentId])

  const handleSaveAppointment = async (values: DoctorAppointmentFormValues) => {
    if (editingAppointment) {
      await updateAppointment(editingAppointment.id, values)
    } else {
      await createAppointment(values)
    }
    setIsCreateModalOpen(false)
    setEditingAppointment(null)
  }

  const getAppointmentPatientName = (appointment: Appointment): string => {
    // Check for [INVITADO: Name] in notes
    if (!appointment.patient_id && appointment.notes?.includes('[INVITADO:')) {
      const match = appointment.notes.match(/\[INVITADO:\s*([^\]]+)\]/)
      if (match?.[1]) return match[1].trim()
    }
    return patientNames[appointment.id] ?? (appointment.patient_id ? 'Cargando...' : 'Invitado Externo')
  }

  return (
    <div className="flex h-full gap-0 overflow-hidden bg-white">
      {/* List Sidebar */}
      <section className="flex w-full flex-col border-r border-am-surface-100 sm:w-80 md:w-96 lg:w-[420px]">
        <div className="border-b border-am-surface-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-am-surface-900">Agenda</h2>
            <button
              onClick={() => {
                setEditingAppointment(null)
                setIsCreateModalOpen(true)
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-am-doctor-600 text-white transition hover:bg-am-doctor-700 shadow-am-sm active:scale-95"
              title="Nueva cita"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <Filter className="h-4 w-4 shrink-0 text-am-surface-400" />
            {(['all', 'today', 'upcoming'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === f
                    ? 'bg-am-doctor-50 text-am-doctor-700 ring-1 ring-am-doctor-200'
                    : 'text-am-surface-500 hover:bg-am-surface-50'
                }`}
              >
                {f === 'all' ? 'Todo' : f === 'today' ? 'Hoy' : 'Próximos'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 scrollbar-thin">
          {loading && appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-am-doctor-500 border-t-transparent" />
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-am-surface-500">Sincronizando...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
              <p className="text-sm font-semibold text-red-700">Error al cargar la agenda</p>
              <button onClick={() => window.location.reload()} className="mt-3 text-xs font-bold text-red-600 underline">Reintentar</button>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="h-16 w-16 rounded-3xl bg-am-surface-50 flex items-center justify-center text-am-surface-200 mb-4 border border-am-surface-100">
                <Calendar className="h-8 w-8" />
              </div>
              <h3 className="text-sm font-bold text-am-surface-800 uppercase tracking-tight">Agenda vacía</h3>
              <p className="mt-2 text-xs text-am-surface-500 leading-relaxed">No hay citas registradas para este filtro.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredAppointments.map(a => {
                const isSelected = selectedAppointmentId === a.id
                const Icon = TYPE_ICONS[a.type ?? 'consultation'] ?? User
                const start = new Date(a.start_time)
                const timeStr = start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                const dateStr = start.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                const windowStatus = getCallWindowStatus(a)

                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAppointmentId(a.id)}
                    className={`group relative flex flex-col rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? 'border-am-doctor-200 bg-am-doctor-50 shadow-am-sm ring-1 ring-am-doctor-100'
                        : 'border-am-surface-100 bg-white hover:border-am-surface-200 hover:bg-am-surface-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className={`rounded-lg p-1.5 ${isSelected ? 'bg-white text-am-doctor-600 shadow-sm' : 'bg-am-surface-50 text-am-surface-400 group-hover:bg-white'}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-bold text-am-surface-400">
                          {dateStr} • {timeStr}
                        </span>
                      </div>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[a.status ?? 'scheduled']}`}>
                        {STATUS_LABELS[a.status ?? 'scheduled']}
                      </span>
                    </div>

                    <h4 className={`mt-3 truncate text-sm font-bold tracking-tight ${isSelected ? 'text-am-doctor-900' : 'text-am-surface-900'}`}>
                      {getAppointmentPatientName(a)}
                    </h4>

                    {a.type === 'telemedicine' && windowStatus.isOpen && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Videollamada disponible</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Details View */}
      <section className="hidden flex-1 overflow-hidden sm:block">
        {selectedAppointment ? (
          <AppointmentDetailsPanel
            appointment={selectedAppointment}
            patientName={getAppointmentPatientName(selectedAppointment)}
            doctorId={doctorId ?? ''}
            onEdit={() => {
              setEditingAppointment(selectedAppointment)
              setIsCreateModalOpen(true)
            }}
            onStatusChange={async (newStatus) => {
              await transitionAppointment(selectedAppointment.id, newStatus)
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-am-surface-50/30 p-12 text-center">
            <div className="h-20 w-20 rounded-[32px] bg-white flex items-center justify-center text-am-surface-100 mb-6 border border-am-surface-100 shadow-am-sm">
              <Clipboard className="h-10 w-10 opacity-20" />
            </div>
            <h3 className="text-base font-bold text-am-surface-400 uppercase tracking-[0.2em]">Seleccioná una cita</h3>
            <p className="mt-3 text-sm text-am-surface-400 max-w-xs leading-relaxed font-medium">Tocá un turno de la lista para gestionar el contexto clínico y la videollamada.</p>
          </div>
        )}
      </section>

      {/* Create/Edit Modal */}
      {isCreateModalOpen && (
          <CreateAppointmentModal
              onClose={() => {
                setIsCreateModalOpen(false);
                setEditingAppointment(null);
              }}
              onSaved={handleSaveAppointment}
              appointment={editingAppointment ?? undefined}
          />
      )}
    </div>
  )
}

function Clipboard(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  )
}
