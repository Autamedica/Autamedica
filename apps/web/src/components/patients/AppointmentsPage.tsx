"use client"

import { useEffect, useMemo, useState } from 'react'
import { fetchApi } from '@/lib/api-client'
import { formatArsFromCents } from '@/lib/payments/money'
import { AppointmentsTable } from '@/components/patients/appointments/AppointmentsTable'
import { CreateAppointmentModal } from '@/components/patients/appointments/CreateAppointmentModal'
import { ReviewModal } from '@/components/patients/appointments/ReviewModal'
import { useAppointments } from '@/hooks/patients/useAppointments'
import { useJoinTelemedicineAppointment } from '@/hooks/patients/useJoinTelemedicineAppointment'
import { useReviews } from '@/hooks/patients/useReviews'
import { ErrorBoundary } from '@/components/patients/ErrorBoundary'
import { Calendar, Plus, CheckCircle, XCircle, CalendarPlus, Video, Loader2, CreditCard, ShieldCheck } from 'lucide-react'
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
    <div className="group relative overflow-hidden rounded-2xl border border-sky-100 bg-white p-5 transition-all duration-200 hover:border-sky-200 hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-stone-950">{value}</p>
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
  const [_patientProfileId, setPatientProfileId] = useState<string | null>(null)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  const [payingAppointmentId, setPayingAppointmentId] = useState<string | null>(null)
  const {
    appointments,
    loading,
    error,
    createAppointment,
    createAppointmentPayment,
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

  useEffect(() => {
    let cancelled = false

    const loadPatientProfileId = async () => {
      try {
        const data = await fetchApi<{ role?: string; _patientProfileId?: string } | null>('/api/auth/me')

        if (cancelled || data?.role !== 'patient') {
          return
        }

        setPatientProfileId(data._patientProfileId ?? null)
      } catch {
        // Non-blocking enhancement only.
      }
    }

    void loadPatientProfileId()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const paymentStatus = params.get('payment')

    if (!paymentStatus) return

    if (paymentStatus === 'success') {
      setPaymentMessage('Volvimos de MercadoPago. Estamos verificando la acreditación; la consulta queda confirmada cuando impacta el webhook.')
      void refreshAppointments()
    } else if (paymentStatus === 'pending') {
      setPaymentMessage('Tu pago quedó pendiente. Apenas se acredite, la consulta se confirma.')
      void refreshAppointments()
    } else if (paymentStatus === 'failure') {
      setPaymentMessage('No se pudo completar el pago. Podés reintentarlo desde tu turno.')
    }

    params.delete('payment')
    const nextUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname
    window.history.replaceState({}, '', nextUrl)
  }, [refreshAppointments])

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

  const pendingPaymentTelemedicineAppointment = useMemo(() => {
    if (!isTelemedicineView) {
      return null
    }

    const pendingAppointments = visibleAppointments.filter(
      (appointment) => appointment.status === 'payment_pending',
    )

    if (pendingAppointments.length === 0) {
      return null
    }

    if (focusAppointmentId) {
      const focused = pendingAppointments.find((appointment) => appointment.id === focusAppointmentId)
      if (focused) {
        return focused
      }
    }

    return [...pendingAppointments].sort(
      (left, right) =>
        new Date(getAppointmentStartIso(left)).getTime() -
        new Date(getAppointmentStartIso(right)).getTime(),
    )[0] ?? null
  }, [focusAppointmentId, isTelemedicineView, visibleAppointments])

  const stats = useMemo(() => {
    const upcoming = visibleAppointments.filter(
      (apt) => apt.status === 'payment_pending' || apt.status === 'scheduled' || apt.status === 'confirmed'
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
      start_time: data.start_time
        ? new Date(data.start_time).toISOString()
        : new Date().toISOString(),
    }
    const newAppointment = await createAppointment(appointmentData)
    if (newAppointment) {
      setIsModalOpen(false)
      await refreshAppointments()
      const payment = await createAppointmentPayment(newAppointment.id)
      if (payment?.checkoutUrl) {
        window.location.href = payment.checkoutUrl
        return
      }
      setPaymentMessage('El turno fue creado, pero no se pudo abrir el checkout. Reintentá desde "Pagar ahora".')
    }
  }

  const handlePayAppointment = async (appointment: AppointmentWithDoctor) => {
    setPayingAppointmentId(appointment.id)
    setPaymentMessage(null)
    try {
      const payment = await createAppointmentPayment(appointment.id)
      if (payment?.checkoutUrl) {
        window.location.href = payment.checkoutUrl
        return
      }
      setPaymentMessage('No se pudo iniciar el pago de la consulta.')
    } finally {
      setPayingAppointmentId(null)
    }
  }

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-white">
      {/* Hero Header */}
      <section className="bg-neutral-900 px-6 lg:px-12 pt-16 pb-20">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6">
              <Calendar className="size-3.5" />
              {stats.upcoming + stats.completed} citas
            </div>
            <h1 className="text-4xl lg:text-5xl text-white mb-4 leading-tight">
              {isTelemedicineView ? 'Telemedicina' : 'Mis citas'}
            </h1>
            <p className="text-lg text-white/60 max-w-lg">
              {isTelemedicineView
                ? 'Videoconsultas con acceso directo a la sala'
                : 'Agenda, gestiona y da seguimiento a tus consultas'}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-7 py-4 bg-white text-neutral-900 rounded-full font-medium hover:bg-neutral-50 transition-all shrink-0"
          >
            <Plus className="size-4" />
            {isTelemedicineView ? 'Nueva videoconsulta' : 'Nueva cita'}
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 -mt-8 pb-32">
        {paymentMessage && (
          <section className="mb-6 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50 px-5 py-4 text-sm text-slate-700 shadow-sm shadow-sky-500/5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 ring-1 ring-sky-100">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-stone-950">Estado del pago</p>
                <p className="mt-1 leading-relaxed">{paymentMessage}</p>
              </div>
            </div>
          </section>
        )}

        {isTelemedicineView && (
          <section className="mb-8 overflow-hidden rounded-[28px] border border-sky-100 bg-white p-6 text-stone-950 shadow-xl shadow-sky-500/5">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                  Acceso directo
                </p>
                <h2 className="font-heading mt-2 text-2xl font-bold tracking-tight">
                  Entrá a tu videoconsulta sin copiar links ni room IDs
                </h2>
                <p className="mt-3 text-sm text-slate-500">
                  La sala se resuelve desde tu turno real. Si ya existe una llamada activa, te conecta
                  a esa misma sesión; si no existe, la prepara antes de abrir el video.
                </p>
              </div>

              {featuredTelemedicineAppointment ? (
                <button
                  type="button"
                  onClick={() => void handleJoinTelemedicine(featuredTelemedicineAppointment)}
                  disabled={joiningAppointmentId === featuredTelemedicineAppointment.id}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-wait disabled:opacity-70"
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
              ) : pendingPaymentTelemedicineAppointment ? (
                <button
                  type="button"
                  onClick={() => void handlePayAppointment(pendingPaymentTelemedicineAppointment)}
                  disabled={payingAppointmentId === pendingPaymentTelemedicineAppointment.id}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-wait disabled:opacity-70"
                >
                  {payingAppointmentId === pendingPaymentTelemedicineAppointment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Calendar className="h-4 w-4" />
                  )}
                  {payingAppointmentId === pendingPaymentTelemedicineAppointment.id
                    ? 'Abriendo pago...'
                    : 'Pagar y confirmar'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <Plus className="h-4 w-4" />
                  Agendar videoconsulta
                </button>
              )}
            </div>

            {featuredTelemedicineAppointment ? (
              <div className="mt-6 grid gap-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-5 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Profesional</p>
                  <p className="mt-1 text-sm font-semibold text-stone-950">
                    {featuredTelemedicineAppointment.doctor
                      ? `Dr. ${featuredTelemedicineAppointment.doctor.first_name ?? ''} ${featuredTelemedicineAppointment.doctor.last_name ?? ''}`.trim()
                      : 'Profesional asignado'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
                  <p className="mt-1 text-sm font-semibold text-stone-950">
                    {new Intl.DateTimeFormat('es-AR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    }).format(new Date(getAppointmentStartIso(featuredTelemedicineAppointment)))}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Hora</p>
                  <p className="mt-1 text-sm font-semibold text-stone-950">
                    {new Intl.DateTimeFormat('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(getAppointmentStartIso(featuredTelemedicineAppointment)))}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Valor</p>
                  <p className="mt-1 text-sm font-semibold text-stone-950">
                    {formatArsFromCents(featuredTelemedicineAppointment.doctor?.consultation_fee)}
                  </p>
                </div>
              </div>
            ) : pendingPaymentTelemedicineAppointment ? (
              <div className="mt-6 overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-sky-50 shadow-sm shadow-amber-500/5">
                <div className="grid gap-5 p-5 sm:grid-cols-[1.2fr_0.8fr] sm:items-center">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-100">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                        Pago pendiente
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-stone-950">
                        Confirmá el pago para habilitar la sala
                      </h3>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                        MercadoPago procesa el cobro y AutaMedica confirma el turno cuando recibimos la acreditación segura.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-amber-100">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                    <p className="mt-1 text-2xl font-bold text-stone-950">
                      {formatArsFromCents(pendingPaymentTelemedicineAppointment.doctor?.consultation_fee)}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Profesional: {pendingPaymentTelemedicineAppointment.doctor
                        ? `Dr. ${pendingPaymentTelemedicineAppointment.doctor.first_name ?? ''} ${pendingPaymentTelemedicineAppointment.doctor.last_name ?? ''}`.trim()
                        : 'Profesional asignado'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 p-5">
                <p className="text-sm text-slate-500">
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
            accent="bg-sky-50 text-sky-700"
          />
          <StatCard
            icon={CheckCircle}
            label={isTelemedicineView ? 'En vivo' : 'Completadas'}
            value={isTelemedicineView ? stats.live : stats.completed}
            accent="bg-sky-50 text-sky-700"
          />
          <StatCard
            icon={XCircle}
            label={isTelemedicineView ? 'Completadas' : 'Canceladas'}
            value={isTelemedicineView ? stats.completed : stats.cancelled}
            accent="bg-sky-50 text-sky-700"
          />
        </div>

        {/* Error */}
        {(joinError || error) && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{String(joinError ?? error)}</p>
          </div>
        )}

        {/* Content */}
        {loading && visibleAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-sky-100 bg-white py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-100 border-t-sky-500" />
            <p className="mt-4 text-sm text-slate-500">
              {isTelemedicineView ? 'Cargando videoconsultas...' : 'Cargando citas...'}
            </p>
          </div>
        ) : visibleAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50">
              <CalendarPlus className="h-7 w-7 text-sky-600" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-stone-950">
              {isTelemedicineView ? 'Sin videoconsultas programadas' : 'Sin citas programadas'}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {isTelemedicineView
                ? 'Agendá tu primera consulta online con un profesional de salud verificado'
                : 'Agendá tu primera consulta con un profesional de salud verificado'}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-500/20 transition-all hover:bg-sky-600 active:scale-[0.98]"
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
            onPayAppointment={(appointment) => void handlePayAppointment(appointment)}
            payingAppointmentId={payingAppointmentId}
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
    </ErrorBoundary>
  )
}
