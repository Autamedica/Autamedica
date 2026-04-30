import type { Appointment } from '@autamedica/types'
"use client"

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Video, User, Plus, Filter, ChevronRight, Stethoscope, FileText, Pill, AlertTriangle } from 'lucide-react'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'

import { resolvePatientNameMap } from '@/lib/doctors/services/appointment.service'
import { getCallWindowStatus } from '@/lib/calls/lib/call-error-messages'
import { CreateAppointmentModal } from './CreateAppointmentModal'
import { AppointmentDetailsPanel } from './AppointmentDetailsPanel'
import { usePatientContext, type PatientContextData } from '@/hooks/doctors/usePatientContext'
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

const DEFAULT_STATUS = 'scheduled'

function getStatusLabel(status: string | null | undefined): string {
  if (!status) return STATUS_LABELS[DEFAULT_STATUS]
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

function getStatusColor(status: string | null | undefined): string {
  if (!status) return STATUS_COLORS[DEFAULT_STATUS]
  return STATUS_COLORS[status] ?? STATUS_COLORS[DEFAULT_STATUS]
}

function getSoftStatusColor(status: string | null | undefined): string {
  return getStatusColor(status).replace('100', '50')
}

function cleanAppointmentNotes(notes: string | null | undefined): string {
  return notes?.replace(/\[INVITADO:[^\]]+\]/, '').trim() ?? ''
}

const TERMINAL_APPOINTMENT_STATUSES = new Set(['cancelled', 'completed', 'no_show'])
const ACTIVE_APPOINTMENT_STATUSES = new Set(['in_progress', 'scheduled', 'confirmed'])

function getAppointmentSortBucket(appointment: Appointment, nowMs: number): number {
  const status = appointment.status ?? DEFAULT_STATUS
  const startMs = Date.parse(appointment.start_time)
  const isFutureOrRecent = !Number.isNaN(startMs) && startMs >= nowMs - 30 * 60 * 1000

  if (status === 'in_progress') return 0
  if (ACTIVE_APPOINTMENT_STATUSES.has(status) && isFutureOrRecent) return 1
  if (ACTIVE_APPOINTMENT_STATUSES.has(status)) return 2
  if (TERMINAL_APPOINTMENT_STATUSES.has(status)) return 4
  return 3
}

function sortAppointmentsForAgenda(left: Appointment, right: Appointment, nowMs: number): number {
  const leftBucket = getAppointmentSortBucket(left, nowMs)
  const rightBucket = getAppointmentSortBucket(right, nowMs)
  if (leftBucket !== rightBucket) return leftBucket - rightBucket

  const leftStart = Date.parse(left.start_time)
  const rightStart = Date.parse(right.start_time)
  const safeLeft = Number.isNaN(leftStart) ? 0 : leftStart
  const safeRight = Number.isNaN(rightStart) ? 0 : rightStart

  return leftBucket === 4 ? safeRight - safeLeft : safeLeft - safeRight
}

function getAnamnesisUrl(patientId: string): string {
  return `/api/doctors/patients/${patientId}/anamnesis?format=html`
}

function ClinicalContextSummary({
  appointment,
  context,
  loading,
  dense = false,
}: {
  appointment: Appointment
  context: PatientContextData | null
  loading: boolean
  dense?: boolean
}) {
  const fallbackReason = cleanAppointmentNotes(appointment.notes)
  const hasPatient = Boolean(appointment.patient_id)
  const hasAnamnesis = context?.hasAnamnesis === true
  const canOpenAnamnesis = hasPatient && hasAnamnesis

  const reasonLabel = context?.chiefComplaint ?? (fallbackReason || 'No especificado')
  const emptyClinicalText = !hasPatient
    ? 'Invitado sin expediente vinculado'
    : hasAnamnesis
      ? 'Sin dato registrado'
      : 'Sin anamnesis compartida'
  const chronicDiseases = context?.chronicDiseases ?? []
  const allergies = context?.allergies ?? []
  const hasRelevantHistory = chronicDiseases.length > 0 || allergies.length > 0

  return (
    <>
      {loading ? (
        <div className={`flex items-center gap-3 justify-center bg-neutral-50/50 rounded-2xl ${dense ? 'py-4' : 'py-4'}`}>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-am-doctor-500 border-t-transparent" />
          <span className="text-xs font-medium text-neutral-400">Cargando contexto clínico...</span>
        </div>
      ) : (
        <div className={`grid ${dense ? 'gap-4 sm:grid-cols-3' : 'gap-8 sm:grid-cols-3'}`}>
          <div className={dense ? '' : 'space-y-2'}>
            <p className={`${dense ? 'text-xs' : 'text-[10px] uppercase tracking-widest'} font-bold text-am-doctor-600 flex items-center gap-2`}>
              <Stethoscope className={dense ? 'h-3.5 w-3.5' : 'h-3 w-3'} /> Motivo de consulta
            </p>
            <p className={`${dense ? 'mt-1 text-sm' : 'text-sm font-semibold'} text-neutral-700 leading-relaxed`}>
              {reasonLabel}
            </p>
          </div>

          <div className={dense ? '' : 'space-y-2'}>
            <p className={`${dense ? 'text-xs' : 'text-[10px] uppercase tracking-widest'} font-bold text-am-doctor-600 flex items-center gap-2`}>
              <AlertTriangle className={dense ? 'h-3.5 w-3.5' : 'h-3 w-3'} /> Antecedentes relevantes
            </p>
            <div className={`flex flex-wrap ${dense ? 'mt-1 gap-1.5' : 'gap-2'}`}>
              {hasRelevantHistory ? (
                <>
                  {chronicDiseases.map((d, i) => (
                    <span key={`chronic-${i}`} className={`${dense ? 'rounded-full border border-amber-200' : 'rounded-lg border border-amber-100'} bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 capitalize`}>
                    {d}
                    </span>
                  ))}
                  {allergies.map((a, i) => (
                    <span key={`allergy-${i}`} className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
                    {a}
                    </span>
                  ))}
                </>
              ) : (
                <span className={`${dense ? 'rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-500' : 'text-sm font-semibold text-neutral-400 italic'}`}>
                  {emptyClinicalText}
                </span>
              )}
            </div>
          </div>

          <div className={dense ? '' : 'space-y-2'}>
            <p className={`${dense ? 'text-xs' : 'text-[10px] uppercase tracking-widest'} font-bold text-am-doctor-600 flex items-center gap-2`}>
              <Pill className={dense ? 'h-3.5 w-3.5' : 'h-3 w-3'} /> Medicación actual
            </p>
            <p className={`${dense ? 'mt-1 text-sm' : 'text-sm font-semibold'} leading-relaxed ${context?.medications ? 'text-neutral-700' : 'text-neutral-400 italic'}`}>
              {context?.medications ?? emptyClinicalText}
            </p>
          </div>
        </div>
      )}

      <div className={`${dense ? 'mt-4 border-t border-neutral-100 pt-3' : 'mt-8'} flex ${dense ? 'justify-center' : 'justify-end'}`}>
        {canOpenAnamnesis ? (
          <a
            href={getAnamnesisUrl(appointment.patient_id as string)}
            target="_blank"
            rel="noreferrer"
            className={`${dense ? 'text-xs' : 'text-[11px]'} inline-flex items-center gap-2 font-bold uppercase tracking-widest text-neutral-400 hover:text-am-doctor-600 transition-colors`}
          >
            <FileText className="h-3.5 w-3.5" /> Ver anamnesis completa <ChevronRight className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className={`${dense ? 'text-xs' : 'text-[11px]'} inline-flex items-center gap-2 font-bold uppercase tracking-widest text-neutral-300`}>
            {hasPatient ? 'Anamnesis no disponible' : 'Sin expediente vinculado'}
          </span>
        )}
      </div>
    </>
  )
}



export function AppointmentsPanel() {
  const { user } = useAuthenticatedUser()
  
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
    const now = new Date()
    const nowMs = now.getTime()
    let list = [...appointments]
    if (filter === 'today') {
      const todayStr = now.toISOString().slice(0, 10)
      list = list.filter(a => a.start_time.startsWith(todayStr))
    } else if (filter === 'upcoming') {
      list = list.filter(a => new Date(a.start_time).getTime() >= nowMs - 30 * 60 * 1000)
    }
    return list.sort((a, b) => sortAppointmentsForAgenda(a, b, nowMs))
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

  const currentPatientId = currentTurno?.patient_id ?? null
  const { context: currentPatientContext, loading: currentContextLoading } = usePatientContext(currentPatientId)

  // Next appointment after the current one
  

  // Today stats
  

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

  
  const windowStatus = currentTurno ? getCallWindowStatus(currentTurno) : null

  return (
    <div className="flex h-full flex-col xl:flex-row gap-0 overflow-hidden bg-white -m-6 -mt-0">
      {/* ── Main Content ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">

        {/* Hero: TURNO ACTUAL (Redesign Premium) */}
        {currentTurno && (
          <div className="px-6 pt-4">
            <div className="rounded-[28px] border border-neutral-100 bg-white p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-neutral-400">Turno actual</h2>
                <button className="text-neutral-300 hover:text-neutral-500 transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
                </button>
              </div>
              
              <div className="flex flex-col lg:flex-row lg:items-center gap-10">
                {/* Left: Time Section */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                    <Clock className="h-10 w-10" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight text-neutral-900">
                      {new Date(currentTurno.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-sm font-medium text-neutral-400 mt-1">
                      Hoy, {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                </div>

                {/* Vertical Divider (Desktop) */}
                <div className="hidden lg:block h-20 w-px bg-neutral-100" />

                {/* Center: Patient Section */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Paciente</p>
                  <h3 className="text-2xl font-bold tracking-tight text-neutral-900 capitalize mb-1.5">
                    {getAppointmentPatientName(currentTurno)}
                  </h3>
                  <p className="text-sm text-neutral-400 font-medium mb-4">
                    {patientNames[currentTurno.id] ? 'Paciente registrado' : 'Cargando detalles...'}
                  </p>
                  <div className="flex">
                    <span className="inline-flex items-center rounded-lg bg-sky-50/70 px-3 py-1.5 text-sky-800 font-bold text-[11px] border border-sky-100">
                      Motivo: {currentTurno.notes?.replace(/\[INVITADO:[^\]]+\]/, '').trim() || 'Consulta programada'}
                    </span>
                  </div>
                </div>

                {/* Right: Status & Actions */}
                <div className="shrink-0 flex flex-col items-center lg:items-end gap-5">
                  <span className={`rounded-lg px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest ${getSoftStatusColor(currentTurno.status)}`}>
                    {getStatusLabel(currentTurno.status)}
                  </span>
                  
                  <div className="flex flex-col items-center">
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
                        className="flex items-center gap-3 rounded-2xl bg-[#137a8c] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-teal-900/10 transition hover:bg-[#0e6378] active:scale-[0.98] uppercase tracking-wider"
                      >
                        <Video className="h-5 w-5" />
                        Iniciar consulta
                      </button>
                    )}
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-neutral-300">
                      {currentTurno.type === 'telemedicine' ? 'Videoconsulta' : 'Consulta Presencial'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Clinical Context Integrated */}
              <div className="mt-10 pt-8 border-t border-neutral-50">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-neutral-400 mb-6">Contexto del paciente</p>
                <ClinicalContextSummary
                  appointment={currentTurno}
                  context={currentPatientContext}
                  loading={currentContextLoading}
                />
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
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getStatusColor(a.status)}`}>
                          {getStatusLabel(a.status)}
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

        {/* CONTEXTO DEL PACIENTE - mobile/tablet detail fallback */}
        {selectedAppointment && (
          <div className="px-6 pt-6 pb-6 xl:hidden">
            <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-4">Contexto del paciente</p>
              <ClinicalContextSummary
                appointment={selectedAppointment}
                context={patientContext}
                loading={contextLoading}
                dense
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Details View (right panel on desktop) ── */}
      <section className="hidden xl:flex xl:w-[440px] 2xl:w-[480px] shrink-0 flex-col overflow-hidden border-l border-neutral-100">
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
