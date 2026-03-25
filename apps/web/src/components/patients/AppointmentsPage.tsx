"use client"

import { useState, useMemo } from 'react'
import { AppointmentsTable } from '@/components/patients/appointments/AppointmentsTable'
import { CreateAppointmentModal } from '@/components/patients/appointments/CreateAppointmentModal'
import { ReviewModal } from '@/components/patients/appointments/ReviewModal'
import { useAppointments } from '@/hooks/patients/useAppointments'
import { useReviews } from '@/hooks/patients/useReviews'
import { Calendar, Plus, CheckCircle, XCircle, CalendarPlus } from 'lucide-react'
import type { CreateAppointmentInput, AppointmentWithDoctor } from '@/lib/patients/types/appointment'

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

export default function AppointmentsPage() {
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
    reviewedAppointmentIds,
    submitting: reviewSubmitting,
    error: reviewError,
    submitReview,
  } = useReviews()

  const stats = useMemo(() => {
    const upcoming = appointments.filter(
      (apt) => apt.status === 'scheduled' || apt.status === 'confirmed'
    ).length
    const completed = appointments.filter((apt) => apt.status === 'completed').length
    const cancelled = appointments.filter((apt) => apt.status === 'cancelled').length
    return { upcoming, completed, cancelled }
  }, [appointments])

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
              Mis citas
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Agenda, gestiona y da seguimiento a tus consultas
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            aria-label="Crear una nueva cita médica"
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Nueva cita
          </button>
        </div>

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
            label="Completadas"
            value={stats.completed}
            accent="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            icon={XCircle}
            label="Canceladas"
            value={stats.cancelled}
            accent="bg-stone-100 text-stone-500"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Content */}
        {loading && appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-100 bg-white py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-800" />
            <p className="mt-4 text-sm text-stone-500">Cargando citas...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-white py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-50">
              <CalendarPlus className="h-7 w-7 text-stone-400" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900">
              Sin citas programadas
            </h3>
            <p className="mt-1 max-w-sm text-sm text-stone-500">
              Agendá tu primera consulta con un profesional de salud verificado
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Agendar cita
            </button>
          </div>
        ) : (
          <AppointmentsTable
            appointments={appointments}
            reviewedAppointmentIds={reviewedAppointmentIds}
            onReviewClick={(apt) => setReviewTarget(apt)}
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
