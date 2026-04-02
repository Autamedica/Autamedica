"use client"

import { DoctorDailySummary } from '@/components/doctors/DoctorDailySummary'
import { GracePeriodBanner } from '@/components/doctors/GracePeriodBanner'
import { OnboardingReminder } from '@/components/doctors/OnboardingReminder'
import { useDoctorsPortal } from '@/components/doctors/layout/portal-context'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useCheckDoctorExists } from '@/hooks/doctors/useCheckDoctorExists'
import type { Locale } from '@/i18n/index'
import { getOnboardingStatus } from '@/lib/onboarding-grace'
import { Activity, Calendar, ClipboardList, Video } from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'

interface DoctorsHomePageProps {
  locale?: Locale
}

function WorkspaceCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  disabled,
  onAction,
}: {
  icon: typeof Activity
  title: string
  description: string
  actionLabel: string
  disabled?: boolean
  onAction: () => void
}): JSX.Element {
  return (
    <div className="rounded-3xl border border-am-surface-200 bg-white p-5 shadow-am-sm">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-am-doctor-50 text-am-doctor-600">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-am-surface-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-am-surface-600">{description}</p>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="mt-5 inline-flex items-center justify-center rounded-xl border border-am-surface-200 bg-white px-4 py-2.5 text-sm font-medium text-am-surface-700 transition-all duration-am-fast hover:border-am-doctor-300 hover:text-am-surface-900 disabled:pointer-events-none disabled:opacity-50"
      >
        {actionLabel}
      </button>
    </div>
  )
}

export default function DoctorsHomePage({ locale: _locale }: DoctorsHomePageProps): JSX.Element {
  const { user, loading: authLoading } = useAuthenticatedUser()
  const { setActiveSection } = useDoctorsPortal()
  const [onboardingRequired, setOnboardingRequired] = useState<boolean | null>(null)

  const onboardingStatus = useMemo(
    () => getOnboardingStatus(user?.onboardingCompletedAt, user?.createdAt),
    [user?.onboardingCompletedAt, user?.createdAt],
  )
  const isBlocked = onboardingStatus.state === 'expired'

  const { exists: doctorExists } = useCheckDoctorExists(user?.id)

  useEffect(() => {
    if (authLoading) {
      return
    }
    if (!user) {
      setOnboardingRequired(false)
      return
    }
    setOnboardingRequired(doctorExists === false)
  }, [authLoading, user, doctorExists])

  if (authLoading || (user && onboardingRequired === null)) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-am-doctor-500 to-am-primary-600">
            <Activity className="h-6 w-6 text-white" />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 animate-spin rounded-full border-2 border-am-doctor-200 border-t-am-doctor-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-am-surface-800">Cargando portal</p>
            <p className="mt-0.5 text-xs text-am-surface-500">Verificando credenciales...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 text-am-surface-900">
      {onboardingStatus.state === 'expired' && <GracePeriodBanner />}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-h-0 overflow-hidden rounded-[28px] border border-am-surface-200 bg-white shadow-am-sm">
          <DoctorDailySummary isBlocked={isBlocked} />
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-am-doctor-100 bg-gradient-to-br from-am-doctor-50 to-white p-5 shadow-am-sm">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-am-doctor-600">
              Flujo Canónico
            </p>
            <h2 className="mt-3 text-lg font-semibold text-am-surface-900">
              La teleconsulta se abre solo desde agenda o pacientes
            </h2>
            <p className="mt-2 text-sm leading-6 text-am-surface-600">
              El portal ya no simula una videollamada local. La sala clínica real se bootstrappea desde un turno o desde la ficha del paciente y redirige a la ruta dedicada de consulta.
            </p>
          </div>

          <WorkspaceCard
            icon={ClipboardList}
            title="Expedientes"
            description="Selecciona un paciente para navegar historial, prescripciones, signos vitales e IA clínica desde un único workspace."
            actionLabel="Ir a pacientes"
            disabled={isBlocked}
            onAction={() => setActiveSection('patients')}
          />

          <WorkspaceCard
            icon={Calendar}
            title="Agenda"
            description="Revisa las consultas del día y entra a una videollamada real desde el turno correspondiente cuando la ventana de acceso esté abierta."
            actionLabel="Ver citas"
            disabled={isBlocked}
            onAction={() => setActiveSection('appointments')}
          />

          <WorkspaceCard
            icon={Video}
            title="Telemedicina"
            description="Las consultas activas viven en `/doctors/call/[roomId]`. El dashboard queda reservado para coordinación, no para renderizar una llamada fake."
            actionLabel="Abrir pacientes"
            disabled={isBlocked}
            onAction={() => setActiveSection('patients')}
          />
        </aside>
      </div>

      {onboardingStatus.state === 'grace_period' && (
        <OnboardingReminder daysRemaining={onboardingStatus.daysRemaining} />
      )}
    </div>
  )
}
