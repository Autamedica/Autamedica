import type { Appointment } from '@autamedica/types'
"use client"

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Video, User, Plus, Filter, ChevronRight, Stethoscope, FileText, Pill, AlertTriangle } from 'lucide-react'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'
import { useCurrentDoctor } from '@/hooks/doctors/useRealDoctors'
import { resolvePatientNameMap } from '@/lib/doctors/services/appointment.service'
import { getCallWindowStatus } from '@/lib/calls/lib/call-error-messages'
import { CreateAppointmentModal } from './CreateAppointmentModal'
import { AppointmentDetailsPanel } from './AppointmentDetailsPanel'
import { usePatientContext } from '@/hooks/doctors/usePatientContext'
import { StartCallButton } from '../calls/StartCallButton'
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

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatDateHeader(): string {
  return new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function getDoctorFirstName(
  doctor: ReturnType<typeof useCurrentDoctor>['doctor'],
  user: ReturnType<typeof useAuthenticatedUser>['user'],
): string {
  const profile = doctor?.profile as { first_name?: string | null; full_name?: string | null } | undefined
  const name = profile?.first_name || profile?.full_name?.split(' ')[0] || user?.profile?.firstName || 'Doctor/a'
  return name
}

export function AppointmentsPanel() {
  const { user } = useAuthenticatedUser()
  const { doctor } = useCurrentDoctor(user?.id)
  const doctorId = user?.doctorProfileId
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

  // Fetch patient clinical context from anamnesis
  const selectedPatientId = selectedAppointment?.patient_id ?? null
  const { context: patientContext, loading: contextLoading } = usePatientContext(selectedPatientId)

  // Find current/next appointment for hero card
  const currentTurno = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const todayAppointments = appointments
      .filter(a => a.start_time.startsWith(todayStr) && a.status !== 'cancelled' && a.status !== 'completed')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    // Find in_progress first, then next upcoming
    const inProgress = todayAppointments.find(a => a.status === 'in_progress')
    if (inProgress) return inProgress

    const upcoming = todayAppointments.find(a => new Date(a.start_time) >= new Date(now.getTime() - 30 * 60000))
    return upcoming ?? todayAppointments[0] ?? null
  }, [appointments])

  // Next appointment after the current one
  const nextTurno = useMemo(() => {
    if (!currentTurno) return null
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    return appointments
      .filter(a =>
        a.start_time.startsWith(todayStr) &&
        a.id !== currentTurno.id &&
        a.status !== 'cancelled' &&
        a.status !== 'completed' &&
        new Date(a.start_time) > new Date(currentTurno.start_time)
      )
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null
  }, [appointments, currentTurno])

  // Today stats
  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const today = appointments.filter(a => a.start_time.startsWith(todayStr))
    return {
      scheduled: today.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length,
      completed: today.filter(a => a.status === 'completed').length,
      pending: today.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length,
      total: today.length,
    }
  }, [appointments])

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
    if (!appointment.patient_id && appointment.notes?.includes('[INVITADO:')) {
      const match = appointment.notes.match(/\[INVITADO:\s*([^\]]+)\]/)
      if (match?.[1]) return match[1].trim()
    }
    return patientNames[appointment.id] ?? (appointment.patient_id ? 'Cargando...' : 'Invitado Externo')
  }

  const doctorFirstName = getDoctorFirstName(doctor, user)
  const windowStatus = currentTurno ? getCallWindowStatus(currentTurno) : null

  return (
    <div className="flex h-full flex-col lg:flex-row gap-0 overflow-hidden bg-white -m-6 -mt-0">
      {/* ── Main Content ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Greeting */}
        <div className="px-6 pt-6 pb-2">
          <h1 className="text-2xl font-light tracking-tight text-neutral-900 md:text-3xl">
            {getGreeting()}, Dr. {doctorFirstName} 👋
          </h1>
          <p className="mt-1 text-sm text-neutral-400 capitalize">{formatDateHeader()}</p>
        </div>

        {/* Hero: TURNO ACTUAL */}
        {currentTurno && (
          <div className="px-6 pt-4">
            <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-4">Turno actual</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Time */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
                    <Clock className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-xl font-bold tracking-tight text-neutral-900">
                      {new Date(currentTurno.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-neutral-400">
                      Hoy, {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                </div>

                {/* Divider */}
                <div className="hidden sm:block h-14 w-px bg-neutral-100" />

                {/* Patient info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] font-bold uppercase text-neutral-400">Paciente</p>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[currentTurno.status ?? 'scheduled']}`}>
                      {STATUS_LABELS[currentTurno.status ?? 'scheduled']}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-neutral-900 truncate capitalize">
                    {getAppointmentPatientName(currentTurno)}
                  </h3>
                  {currentTurno.notes && !currentTurno.notes.includes('[INVITADO:') && (
                    <p className="mt-1 text-xs text-neutral-500 truncate">
                      <span className="inline-block rounded bg-am-doctor-50 px-1.5 py-0.5 text-am-doctor-700 font-medium text-[10px]">
                        Motivo: {currentTurno.notes.slice(0, 60)}
                      </span>
                    </p>
                  )}
                </div>

                {/* CTA */}
                <div className="shrink-0">
                  {currentTurno.type === 'telemedicine' && windowStatus?.isOpen ? (
                    <StartCallButton
                      doctorId={currentTurno.doctor_id ?? ''}
                      patientId={currentTurno.patient_id ?? ''}
                      appointmentId={currentTurno.id}
                      patientName={getAppointmentPatientName(currentTurno)}
                      disabled={false}
                    />
                  ) : (
                    <button
                      onClick={() => setSelectedAppointmentId(currentTurno.id)}
                      className="flex items-center gap-2 rounded-xl bg-am-doctor-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-am-doctor-700 active:scale-[0.98]"
                    >
                      <Stethoscope className="h-4 w-4" />
                      Ver consulta
                    </button>
                  )}
                  <p className="mt-1.5 text-center text-[10px] text-neutral-400">
                    {currentTurno.type === 'telemedicine' ? 'Videoconsulta' : 'Presencial'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AGENDA DEL DÍA */}
        <div className="px-6 pt-6">
          <div className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm">
            <div className="border-b border-neutral-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Agenda del día</h2>
                <button
                  onClick={() => { setEditingAppointment(null); setIsCreateModalOpen(true) }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-am-doctor-600 text-white transition hover:bg-am-doctor-700 shadow-sm active:scale-95"
                  title="Nueva cita"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
                {(['all', 'today', 'upcoming'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filter === f
                        ? 'bg-am-doctor-50 text-am-doctor-700 ring-1 ring-am-doctor-200'
                        : 'text-neutral-400 hover:bg-neutral-50'
                    }`}
                  >
                    {f === 'all' ? 'Todo' : f === 'today' ? 'Hoy' : 'Próximos'}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-3 scrollbar-thin">
              {loading && appointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 opacity-40">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-am-doctor-500 border-t-transparent" />
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Sincronizando...</p>
                </div>
              ) : error ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
                  <p className="text-sm font-semibold text-red-700">Error al cargar la agenda</p>
                  <button onClick={() => window.location.reload()} className="mt-2 text-xs font-bold text-red-600 underline">Reintentar</button>
                </div>
              ) : filteredAppointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <Calendar className="h-8 w-8 text-neutral-200 mb-3" />
                  <h3 className="text-sm font-bold text-neutral-400">Agenda vacía</h3>
                  <p className="mt-1 text-xs text-neutral-400">No hay citas para este filtro.</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-50">
                  {filteredAppointments.map(a => {
                    const isSelected = selectedAppointmentId === a.id
                    const isCurrent = currentTurno?.id === a.id
                    const start = new Date(a.start_time)
                    const timeStr = start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                    const isTelemedicine = a.type === 'telemedicine'

                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAppointmentId(a.id)}
                        className={`group relative flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-all ${
                          isSelected
                            ? 'bg-am-doctor-50 ring-1 ring-am-doctor-100'
                            : isCurrent
                            ? 'bg-emerald-50/50'
                            : 'hover:bg-neutral-50'
                        }`}
                      >
                        {/* Time + icon */}
                        <div className="flex items-center gap-2.5 shrink-0 w-28">
                          {isTelemedicine ? (
                            <Video className="h-4 w-4 text-am-doctor-500" />
                          ) : (
                            <User className="h-4 w-4 text-neutral-400" />
                          )}
                          <span className="text-sm font-bold text-neutral-700">{timeStr}</span>
                          {isTelemedicine && (
                            <span className="text-[9px] font-medium text-neutral-400">Video</span>
                          )}
                        </div>

                        {/* Patient */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-neutral-900 truncate capitalize">
                            {getAppointmentPatientName(a)}
                          </p>
                          {a.notes && !a.notes.includes('[INVITADO:') && (
                            <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                              {a.notes.slice(0, 50)}
                            </p>
                          )}
                        </div>

                        {/* Status */}
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[a.status ?? 'scheduled']}`}>
                          {STATUS_LABELS[a.status ?? 'scheduled']}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <button className="flex w-full items-center justify-center gap-2 border-t border-neutral-100 py-3 text-xs font-semibold text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition">
              Ver agenda completa <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* CONTEXTO DEL PACIENTE - when appointment selected */}
        {selectedAppointment && (
          <div className="px-6 pt-6 pb-6">
            <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-4">Contexto del paciente</p>
              {contextLoading ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-am-doctor-500 border-t-transparent" />
                  <span className="text-xs text-neutral-400">Cargando contexto clínico...</span>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold text-am-doctor-700 mb-1 flex items-center gap-1.5">
                      <Stethoscope className="h-3.5 w-3.5" /> Motivo de consulta
                    </p>
                    <p className="text-sm text-neutral-700 leading-relaxed">
                      {patientContext?.chiefComplaint
                        ?? selectedAppointment.notes?.replace(/\[INVITADO:[^\]]+\]/, '').trim()
                        || 'No especificado'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-am-doctor-700 mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Antecedentes relevantes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {patientContext?.chronicDiseases && patientContext.chronicDiseases.length > 0 ? (
                        patientContext.chronicDiseases.map((d, i) => (
                          <span key={i} className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-medium text-amber-700 capitalize">{d}</span>
                        ))
                      ) : patientContext?.allergies && patientContext.allergies.length > 0 ? (
                        patientContext.allergies.map((a, i) => (
                          <span key={i} className="rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-700">{a}</span>
                        ))
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-500">
                          {patientContext?.hasAnamnesis === false ? 'Sin anamnesis' : 'Sin antecedentes registrados'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-am-doctor-700 mb-1 flex items-center gap-1.5">
                      <Pill className="h-3.5 w-3.5" /> Medicación actual
                    </p>
                    <p className={`text-sm leading-relaxed ${patientContext?.medications ? 'text-neutral-700' : 'text-neutral-400 italic'}`}>
                      {patientContext?.medications ?? (patientContext?.hasAnamnesis === false ? 'Sin anamnesis' : 'Sin medicación registrada')}
                    </p>
                  </div>
                </div>
              )}
              {selectedAppointment.patient_id && (
                <a
                  href={`/doctors/patients/${selectedAppointment.patient_id}?tab=anamnesis`}
                  className="mt-4 flex w-full items-center justify-center gap-2 border-t border-neutral-100 pt-3 text-xs font-semibold text-neutral-400 hover:text-am-doctor-600 transition"
                >
                  <FileText className="h-3.5 w-3.5" /> Ver anamnesis completa <ChevronRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Details View (right panel on desktop) ── */}
      <section className="hidden lg:flex w-[420px] shrink-0 flex-col overflow-hidden border-l border-neutral-100">
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
          <div className="flex h-full flex-col items-center justify-center bg-neutral-50/30 p-12 text-center">
            <div className="h-16 w-16 rounded-3xl bg-white flex items-center justify-center text-neutral-100 mb-5 border border-neutral-100 shadow-sm">
              <Calendar className="h-8 w-8 opacity-20" />
            </div>
            <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-[0.15em]">Seleccioná una cita</h3>
            <p className="mt-2 text-xs text-neutral-400 max-w-xs leading-relaxed">Tocá un turno de la lista para ver el detalle.</p>
          </div>
        )}
      </section>

      {/* Create/Edit Modal */}
      {isCreateModalOpen && (
        <CreateAppointmentModal
          onClose={() => { setIsCreateModalOpen(false); setEditingAppointment(null) }}
          onSaved={handleSaveAppointment}
          appointment={editingAppointment ?? undefined}
        />
      )}
    </div>
  )
}
