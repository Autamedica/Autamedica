"use client"

import { useState, useMemo } from 'react'
import { AppointmentsTable } from '@/components/patients/appointments/AppointmentsTable'
import { CreateAppointmentModal } from '@/components/patients/appointments/CreateAppointmentModal'
import { ReviewModal } from '@/components/patients/appointments/ReviewModal'
import { useAppointments } from '@/hooks/patients/useAppointments'
import { useJoinTelemedicineAppointment } from '@/hooks/patients/useJoinTelemedicineAppointment'
import { useReviews } from '@/hooks/patients/useReviews'
import { Calendar, Plus, CheckCircle, XCircle, CalendarPlus, Video, Loader2 } from 'lucide-react'
import {
  getAppointmentStartIso,
  isJoinableTelemedicineAppointment,
  isTelemedicineAppointment,
} from '@/lib/patients/lib/telemedicine-entry'
import type { CreateAppointmentInput, AppointmentWithDoctor } from '@/lib/patients/types/appointment'
import type { AppointmentType } from '@/lib/patients/types/appointment'

type AppointmentsPageMode = 'all' | 'telemedicine'

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Calendar
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-stone-100 bg-white p-5 transition-all duration-200 hover:shadow-md hover:border-stone-200">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-stone-500">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-stone-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

export default function AppointmentsPage({
  mode = 'all',
  focusAppointmentId = null,
}: {
  mode?: AppointmentsPageMode
  focusAppointmentId?: string | null
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<AppointmentWithDoctor | null>(null)
  const {
    appointments,
    loading,
    error,
    createAppointment,
    refreshAppointments,
  } = useAppointments()
  const {
    joinAppointment,
    joiningAppointmentId,
    error: joinError,
    clearError: clearJoinError,
  } = useJoinTelemedicineAppointment()
  const {
    reviewedAppointmentIds,
    submitting: reviewSubmitting,
    error: reviewError,
    submitReview,
  } = useReviews()

  const isTelemedicineView = mode === 'telemedicine'

  const visibleAppointments = useMemo(() => {
    const filtered = isTelemedicineView
      ? appointments.filter(isTelemedicineAppointment)
      : appointments

    if (!isTelemedicineView) {
      return filtered
    }

    return filtered.map((appointment) => {
      if (appointment.type === 'telemedicine' || !appointment.meeting_url) {
        return appointment
      }

      return {
        ...appointment,
        type: 'telemedicine' as AppointmentType,
      }
    })
  }, [appointments, isTelemedicineView])

  const featuredTelemedicineAppointment = useMemo(() => {
    if (!isTelemedicineView) {
      return null
    }

    const joinableAppointments = visibleAppointments.filter(isJoinableTelemedicineAppointment)
    if (joinableAppointments.length === 0) {
      return null
    }

    if (focusAppointmentId) {
      const focused = joinableAppointments.find((appointment) => appointment.id === focusAppointmentId)
      if (focused) {
        return focused
      }
    }

    const liveAppointment = joinableAppointments.find(
      (appointment) => appointment.status === 'in_progress',
    )
    if (liveAppointment) {
      return liveAppointment
    }

    return [...joinableAppointments].sort(
      (left, right) =>
        new Date(getAppointmentStartIso(left)).getTime() -
        new Date(getAppointmentStartIso(right)).getTime(),
    )[0] ?? null
  }, [focusAppointmentId, isTelemedicineView, visibleAppointments])

  const stats = useMemo(() => {
    const upcoming = visibleAppointments.filter(
      (apt) => apt.status === 'scheduled' || apt.status === 'confirmed'
    ).length
    const completed = visibleAppointments.filter((apt) => apt.status === 'completed').length
    const cancelled = visibleAppointments.filter((apt) => apt.status === 'cancelled').length
    const live = visibleAppointments.filter((apt) => apt.status === 'in_progress').length

    return { upcoming, completed, cancelled, live }
  }, [visibleAppointments])

  const handleJoinTelemedicine = async (appointment: AppointmentWithDoctor) => {
    clearJoinError()
    await joinAppointment(appointment.id)
  }

  const handleCreateAppointment = async (data: CreateAppointmentInput) => {
    const appointmentData = {
      ...data,
      scheduled_at: data.scheduled_at
        ? new Date(data.scheduled_at).toISOString()
        : new Date().toISOString(),
    }
    const newAppointment = await createAppointment(appointmentData)
    if (newAppointment) {
      setIsModalOpen(false)
      await refreshAppointments()
    }
  }

  return (
    <div className="min-h-screen bg-stone-50/50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              {isTelemedicineView ? 'Telemedicina' : 'Mis citas'}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {isTelemedicineView
                ? 'Agenda y gestioná tus videoconsultas con acceso directo a la sala'
                : 'Agenda, gestiona y da seguimiento a tus consultas'}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            aria-label={isTelemedicineView ? 'Crear una nueva videoconsulta' : 'Crear una nueva cita médica'}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            {isTelemedicineView ? 'Nueva videoconsulta' : 'Nueva cita'}
          </button>
        </div>

        {isTelemedicineView && (
          <section className="mb-8 overflow-hidden rounded-[28px] bg-stone-950 p-6 text-white shadow-xl shadow-stone-950/10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  Acceso directo
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  Entrá a tu videoconsulta sin copiar links ni room IDs
                </h2>
                <p className="mt-3 text-sm text-stone-300">
                  La sala se resuelve desde tu turno real. Si ya existe una llamada activa, te conecta
                  a esa misma sesión; si no existe, la prepara antes de abrir el video.
                </p>
              </div>

              {featuredTelemedicineAppointment ? (
                <button
                  type="button"
                  onClick={() => void handleJoinTelemedicine(featuredTelemedicineAppointment)}
                  disabled={joiningAppointmentId === featuredTelemedicineAppointment.id}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-400 disabled:cursor-wait disabled:opacity-70"
                >
                  {joiningAppointmentId === featuredTelemedicineAppointment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  {joiningAppointmentId === featuredTelemedicineAppointment.id
                    ? 'Abriendo sala...'
                    : 'Entrar a la videollamada'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <Plus className="h-4 w-4" />
                  Agendar videoconsulta
                </button>
              )}
            </div>

            {featuredTelemedicineAppointment ? (
              <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-400">Profesional</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {featuredTelemedicineAppointment.doctor
                      ? `Dr. ${featuredTelemedicineAppointment.doctor.first_name ?? ''} ${featuredTelemedicineAppointment.doctor.last_name ?? ''}`.trim()
                      : 'Profesional asignado'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-400">Fecha</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {new Intl.DateTimeFormat('es-AR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    }).format(new Date(getAppointmentStartIso(featuredTelemedicineAppointment)))}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-400">Hora</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {new Intl.DateTimeFormat('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(getAppointmentStartIso(featuredTelemedicineAppointment)))}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/5 p-5">
                <p className="text-sm text-stone-300">
                  Todavía no tenés una videoconsulta activa o próxima para abrir directo desde acá.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4" role="region" aria-label="Estadísticas de citas">
          <StatCard
            icon={Calendar}
            label="Próximas"
            value={stats.upcoming}
            accent="bg-sky-50 text-sky-600"
          />
          <StatCard
            icon={CheckCircle}
            label={isTelemedicineView ? 'En vivo' : 'Completadas'}
            value={isTelemedicineView ? stats.live : stats.completed}
            accent={isTelemedicineView ? 'bg-cyan-50 text-cyan-600' : 'bg-emerald-50 text-emerald-600'}
          />
          <StatCard
            icon={XCircle}
            label={isTelemedicineView ? 'Completadas' : 'Canceladas'}
            value={isTelemedicineView ? stats.completed : stats.cancelled}
            accent={isTelemedicineView ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-500'}
          />
        </div>

        {/* Error */}
        {(joinError || error) && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{joinError ?? error}</p>
          </div>
        )}

        {/* Content */}
        {loading && visibleAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-100 bg-white py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-800" />
            <p className="mt-4 text-sm text-stone-500">
              {isTelemedicineView ? 'Cargando videoconsultas...' : 'Cargando citas...'}
            </p>
          </div>
        ) : visibleAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-white py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-50">
              <CalendarPlus className="h-7 w-7 text-stone-400" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900">
              {isTelemedicineView ? 'Sin videoconsultas programadas' : 'Sin citas programadas'}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-stone-500">
              {isTelemedicineView
                ? 'Agendá tu primera consulta online con un profesional de salud verificado'
                : 'Agendá tu primera consulta con un profesional de salud verificado'}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              {isTelemedicineView ? 'Agendar videoconsulta' : 'Agendar cita'}
            </button>
          </div>
        ) : (
          <AppointmentsTable
            appointments={visibleAppointments}
            reviewedAppointmentIds={reviewedAppointmentIds}
            onReviewClick={(apt) => setReviewTarget(apt)}
            onJoinTelemedicine={(appointment) => void handleJoinTelemedicine(appointment)}
            joiningAppointmentId={joiningAppointmentId}
          />
        )}
      </div>

      <CreateAppointmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateAppointment}
      />

      {reviewTarget && (
        <ReviewModal
          isOpen={!!reviewTarget}
          onClose={() => setReviewTarget(null)}
          appointment={reviewTarget}
          onSubmit={submitReview}
          submitting={reviewSubmitting}
          error={reviewError}
        />
      )}
    </div>
  )
}
