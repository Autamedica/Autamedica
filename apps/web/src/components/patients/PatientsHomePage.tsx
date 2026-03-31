'use client'

import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { useAppointments } from '@/hooks/patients/useAppointments'
import { useJoinTelemedicineAppointment } from '@/hooks/patients/useJoinTelemedicineAppointment'
import type { Locale } from '@/i18n/index'
import {
  Bell,
  Calendar,
  ChevronRight,
  Clock,
  User,
  Video,
} from 'lucide-react'
import {
  IconVideoconsulta,
  IconTurnos,
  IconAnamnesis,
  IconRecetas,
  IconHistorial,
  IconComunidad,
} from '@/components/patients/icons/FeatureIcons'
import { useEffect, useMemo, useState } from 'react'
import { IncomingCallHandler } from '@/components/patients/calls/IncomingCallHandler'
import BottomNav from '@/components/patients/layout/BottomNav'
import {
  buildPatientTelemedicineEntryUrl,
  isJoinableTelemedicineAppointment,
  isTelemedicineAppointment,
} from '@/lib/patients/lib/telemedicine-entry'

function getFirstName(
  profile: ReturnType<typeof usePatientSession>['profile'],
  user: ReturnType<typeof usePatientSession>['user']
): string {
  if (profile?.firstName) return profile.firstName
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name : undefined
  if (fullName) return fullName.split(' ')[0]
  return user?.email?.split('@')[0] ?? 'Paciente'
}

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const CONSULTAS = [
  { key: 'videoconsulta', label: 'Videoconsulta', sub: 'Conectá con tu médico en vivo', href: '/patients/appointments?type=telemedicine', icon: IconVideoconsulta, color: '#10B981', bgClass: 'bg-emerald-50' },
  { key: 'agenda', label: 'Mis turnos', sub: 'Agendá y gestioná tus citas', href: '/patients/appointments', icon: IconTurnos, color: '#0EA5E9', bgClass: 'bg-sky-50' },
  { key: 'anamnesis', label: 'Anamnesis', sub: 'Completá tu historia clínica', href: '/patients/anamnesis', icon: IconAnamnesis, color: '#F59E0B', bgClass: 'bg-amber-50' },
] as const

const SALUD = [
  { key: 'recetas', label: 'Recetas', sub: 'Tus prescripciones médicas', href: '/patients/medical-history?tab=prescriptions', icon: IconRecetas, color: '#8B5CF6', bgClass: 'bg-violet-50' },
  { key: 'historial', label: 'Historial', sub: 'Registros y transcripciones', href: '/patients/medical-history', icon: IconHistorial, color: '#64748B', bgClass: 'bg-slate-50' },
  { key: 'comunidad', label: 'Comunidad', sub: 'Conectá con otros pacientes', href: '/patients/community', icon: IconComunidad, color: '#F43F5E', bgClass: 'bg-rose-50' },
] as const

interface PatientsHomePageProps {
  locale?: Locale
}

export default function PatientsHomePage({ locale }: PatientsHomePageProps) {
  const { user, profile, patient } = usePatientSession()
  const { appointments } = useAppointments()
  const {
    joinAppointment,
    joiningAppointmentId,
    error: joinError,
    clearError: clearJoinError,
  } = useJoinTelemedicineAppointment()
  const [hasHydrated, setHasHydrated] = useState(false)
  const firstName = getFirstName(profile, user)
  const completedConsults = appointments.filter(a => a.status === 'completed').length
  const freeConsults = patient?.freeConsultationsRemaining ?? 0

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  const upcomingAppointment = useMemo(() => {
    if (!hasHydrated) {
      return null
    }

    const liveAppointment = appointments
      .filter(a => a.status === 'in_progress')
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null

    if (liveAppointment) {
      return liveAppointment
    }

    const now = new Date()
    return appointments
      .filter(a => a.status === 'scheduled' || a.status === 'confirmed')
      .filter(a => new Date(a.scheduled_at) > now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null
  }, [appointments, hasHydrated])

  const upcomingCount = useMemo(() => {
    if (!hasHydrated) {
      return 0
    }

    const now = new Date()
    return appointments.filter(a =>
      (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.scheduled_at) > now
    ).length
  }, [appointments, hasHydrated])

  const dateLocale = locale === 'pt' ? 'pt-BR' : 'es-AR'
  const greeting = hasHydrated ? getTimeGreeting() : 'Hola'
  const upcomingTelemedicine = upcomingAppointment && isTelemedicineAppointment(upcomingAppointment)
    ? upcomingAppointment
    : null
  const canJoinUpcomingTelemedicine = upcomingTelemedicine
    ? isJoinableTelemedicineAppointment(upcomingTelemedicine)
    : false

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white shadow-sm shadow-sky-500/20">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-heading text-sm font-semibold text-gray-900">
                {greeting}, {firstName}
              </p>
              <p className="text-xs text-gray-400">Tu salud, tu control</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Notificaciones"
            >
              <Bell className="h-5 w-5" />
              {upcomingCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {upcomingCount}
                </span>
              )}
            </button>
            <a
              href="/patients/profile"
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Perfil"
            >
              <User className="h-5 w-5" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-28 pt-6">
        {/* Próxima cita */}
        {upcomingAppointment ? (
          <section className="mb-8">
            {canJoinUpcomingTelemedicine ? (
              <button
                type="button"
                onClick={() => {
                  if (!upcomingTelemedicine) return
                  clearJoinError()
                  void joinAppointment(upcomingTelemedicine.id)
                }}
                disabled={joiningAppointmentId === upcomingTelemedicine?.id}
                className="group block w-full rounded-2xl border border-sky-100 bg-sky-50/40 p-5 text-left transition-all hover:border-sky-200 hover:shadow-sm disabled:cursor-wait disabled:opacity-80 active:scale-[0.98]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-full bg-sky-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                    Próxima consulta
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  {upcomingAppointment.doctor
                    ? `Dr. ${upcomingAppointment.doctor.first_name ?? ''} ${upcomingAppointment.doctor.last_name ?? ''}`
                    : 'Consulta programada'}
                </h2>
                {upcomingAppointment.doctor?.specialty && (
                  <p className="mt-0.5 text-sm text-gray-500">{upcomingAppointment.doctor.specialty}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {new Intl.DateTimeFormat(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(upcomingAppointment.scheduled_at))}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {new Intl.DateTimeFormat(dateLocale, { hour: '2-digit', minute: '2-digit' }).format(new Date(upcomingAppointment.scheduled_at))}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-900">
                    <Video className="h-4 w-4" />
                    Videoconsulta
                  </span>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700">
                  <Video className="h-4 w-4" />
                  {joiningAppointmentId === upcomingTelemedicine?.id
                    ? 'Abriendo sala...'
                    : 'Entrar a la videollamada'}
                </div>
              </button>
            ) : (
            <a
              href={upcomingTelemedicine
                ? buildPatientTelemedicineEntryUrl(upcomingTelemedicine.id)
                : '/patients/appointments'}
              className="group block rounded-2xl border border-sky-100 bg-sky-50/40 p-5 transition-all hover:border-sky-200 hover:shadow-sm active:scale-[0.98]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-full bg-sky-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                  Próxima consulta
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">
                {upcomingAppointment.doctor
                  ? `Dr. ${upcomingAppointment.doctor.first_name ?? ''} ${upcomingAppointment.doctor.last_name ?? ''}`
                  : 'Consulta programada'}
              </h2>
              {upcomingAppointment.doctor?.specialty && (
                <p className="mt-0.5 text-sm text-gray-500">{upcomingAppointment.doctor.specialty}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {new Intl.DateTimeFormat(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(upcomingAppointment.scheduled_at))}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {new Intl.DateTimeFormat(dateLocale, { hour: '2-digit', minute: '2-digit' }).format(new Date(upcomingAppointment.scheduled_at))}
                </span>
                {upcomingTelemedicine && (
                  <span className="flex items-center gap-1.5 text-gray-900">
                    <Video className="h-4 w-4" />
                    Videoconsulta
                  </span>
                )}
              </div>
            </a>
            )}
            {joinError && canJoinUpcomingTelemedicine && (
              <p className="mt-3 text-sm text-red-600">{joinError}</p>
            )}
          </section>
        ) : (
          <a
            href="/patients/anamnesis"
            className="group mb-8 block py-4 transition-opacity active:opacity-80"
          >
            <p className="text-lg leading-relaxed text-gray-500">
              <span className="font-semibold text-gray-900">{firstName}</span>
              , <span className="font-semibold text-gray-900">{completedConsults}</span> {completedConsults === 1 ? 'profesional revisó' : 'profesionales revisaron'} tu
              historial clínico. Cada dato que cargás permite que tu próximo médico te atienda{' '}
              <span className="text-gray-900">conociendo tu historia desde el primer minuto</span>.
            </p>
            {freeConsults > 0 && (
              <p className="mt-3 text-sm text-gray-400">
                Tenés <span className="font-semibold text-gray-900">{freeConsults} {freeConsults === 1 ? 'consulta gratuita' : 'consultas gratuitas'}</span> para empezar.
              </p>
            )}
          </a>
        )}

        {/* Carousel: Consultas */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Consultas</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {CONSULTAS.map(({ key, label, sub, href, icon: Icon, color, bgClass }, i) => (
              <a
                key={key}
                href={href}
                className={`group flex shrink-0 items-start gap-3 rounded-2xl border p-4 transition-all hover:shadow-md active:scale-[0.97] ${
                  i === 0
                    ? 'w-[240px] border-gray-200 bg-gray-50'
                    : 'w-[180px] border-gray-100 bg-white hover:border-gray-200'
                }`}
              >
                <div className={`flex shrink-0 items-center justify-center rounded-xl ${bgClass} ${i === 0 ? 'h-9 w-9' : 'h-8 w-8'}`}>
                  <Icon className={`shrink-0 ${i === 0 ? 'h-5 w-5' : 'h-4 w-4'}`} style={{ color }} />
                </div>
                <div className="min-w-0">
                  <p className={`font-semibold text-gray-900 ${i === 0 ? 'text-base' : 'text-sm'}`}>{label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-400">{sub}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Visual separator */}
        <div className="my-6 overflow-hidden rounded-2xl">
          <img
            src="/images/patients/hero-medical.webp"
            alt=""
            className="h-[120px] w-full object-cover"
            loading="lazy"
          />
        </div>

        {/* Carousel: Tu salud */}
        <section>
          <h2 className="mb-3 text-sm font-medium text-gray-500">Tu salud</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {SALUD.map(({ key, label, sub, href, icon: Icon, color, bgClass }) => (
              <a
                key={key}
                href={href}
                className="group flex w-[180px] shrink-0 items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:border-gray-200 hover:shadow-md active:scale-[0.97]"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bgClass}`}>
                  <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-400">{sub}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>

      <BottomNav activeTab="inicio" />

      {patient?.id && <IncomingCallHandler patientId={patient.id} />}
    </div>
  )
}
