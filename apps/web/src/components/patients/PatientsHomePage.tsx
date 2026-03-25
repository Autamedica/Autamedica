'use client'

import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { useAppointments } from '@/hooks/patients/useAppointments'
import type { Locale } from '@/i18n/index'
import {
  Bell,
  Calendar,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  MessageCircle,
  Pill,
  User,
  Video,
} from 'lucide-react'
import { useMemo } from 'react'
import { IncomingCallHandler } from '@/components/patients/calls/IncomingCallHandler'
import BottomNav from '@/components/patients/layout/BottomNav'

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
  { key: 'videoconsulta', label: 'Videoconsulta', sub: 'Conectá con tu médico en vivo', href: '/patients/appointments?type=telemedicine', icon: Video, accent: '#22d3ee' },
  { key: 'agenda', label: 'Mis turnos', sub: 'Agendá y gestioná tus citas', href: '/patients/appointments', icon: Calendar, accent: '#10b981' },
  { key: 'anamnesis', label: 'Anamnesis', sub: 'Completá tu historia clínica', href: '/patients/anamnesis', icon: ClipboardList, accent: '#8b5cf6' },
] as const

const SALUD = [
  { key: 'recetas', label: 'Recetas', sub: 'Tus prescripciones médicas', href: '/patients/medical-history?tab=prescriptions', icon: Pill, accent: '#f97316' },
  { key: 'historial', label: 'Historial', sub: 'Registros y transcripciones', href: '/patients/medical-history', icon: FileText, accent: '#ec4899' },
  { key: 'comunidad', label: 'Comunidad', sub: 'Conectá con otros pacientes', href: '/patients/community', icon: MessageCircle, accent: '#6366f1' },
] as const

interface PatientsHomePageProps {
  locale?: Locale
}

export default function PatientsHomePage({ locale }: PatientsHomePageProps) {
  const { user, profile } = usePatientSession()
  const { appointments } = useAppointments()
  const firstName = getFirstName(profile, user)

  const upcomingAppointment = useMemo(() => {
    const now = new Date()
    return appointments
      .filter(a => a.status === 'scheduled' || a.status === 'confirmed')
      .filter(a => new Date(a.scheduled_at) > now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null
  }, [appointments])

  const upcomingCount = appointments.filter(a =>
    (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.scheduled_at) > new Date()
  ).length

  const dateLocale = locale === 'pt' ? 'pt-BR' : 'es-AR'

  return (
    <div className="min-h-screen" style={{ background: 'var(--au-bg)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: 'rgba(9, 9, 11, 0.85)',
          borderBottom: '1px solid var(--au-border)',
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, var(--au-accent), #6366f1)',
                color: 'var(--au-bg)',
              }}
            >
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--au-text-primary)' }}>
                {getTimeGreeting()}, {firstName}
              </p>
              <p className="text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
                Tu salud, tu control
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--au-text-secondary)' }}
              aria-label="Notificaciones"
            >
              <Bell className="h-5 w-5" />
              {upcomingCount > 0 && (
                <span
                  className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--au-danger)', color: '#fff' }}
                >
                  {upcomingCount}
                </span>
              )}
            </button>
            <a
              href="/patients/profile"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--au-text-secondary)' }}
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
            <a
              href={upcomingAppointment.type === 'telemedicine' && upcomingAppointment.meeting_url
                ? upcomingAppointment.meeting_url
                : '/patients/appointments'}
              className="group block overflow-hidden rounded-2xl p-[1px] transition-transform active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, var(--au-accent), #6366f1)',
              }}
            >
              <div
                className="rounded-2xl p-5"
                style={{ background: 'var(--au-surface)' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ background: 'var(--au-accent-soft)', color: 'var(--au-accent)' }}
                  >
                    Próxima consulta
                  </span>
                  <ChevronRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    style={{ color: 'var(--au-text-tertiary)' }}
                  />
                </div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--au-text-primary)' }}>
                  {upcomingAppointment.doctor
                    ? `Dr. ${upcomingAppointment.doctor.first_name ?? ''} ${upcomingAppointment.doctor.last_name ?? ''}`
                    : 'Consulta programada'}
                </h2>
                {upcomingAppointment.doctor?.specialty && (
                  <p className="mt-0.5 text-sm" style={{ color: 'var(--au-text-secondary)' }}>
                    {upcomingAppointment.doctor.specialty}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--au-text-tertiary)' }}>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {new Intl.DateTimeFormat(dateLocale, {
                      weekday: 'short', day: 'numeric', month: 'short',
                    }).format(new Date(upcomingAppointment.scheduled_at))}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {new Intl.DateTimeFormat(dateLocale, {
                      hour: '2-digit', minute: '2-digit',
                    }).format(new Date(upcomingAppointment.scheduled_at))}
                  </span>
                  {upcomingAppointment.type === 'telemedicine' && (
                    <span className="flex items-center gap-1.5" style={{ color: 'var(--au-accent)' }}>
                      <Video className="h-4 w-4" />
                      Videoconsulta
                    </span>
                  )}
                </div>
              </div>
            </a>
          </section>
        ) : (
          <section className="mb-8">
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: 'var(--au-surface)',
                border: '1px dashed var(--au-border)',
              }}
            >
              <Calendar className="mx-auto mb-3 h-10 w-10" style={{ color: 'var(--au-text-tertiary)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--au-text-primary)' }}>
                Sin consultas programadas
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
                Agendá tu primera videoconsulta
              </p>
              <a
                href="/patients/appointments"
                className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform active:scale-95"
                style={{
                  background: 'var(--au-accent)',
                  color: 'var(--au-bg)',
                }}
              >
                <Video className="h-4 w-4" />
                Agendar consulta
              </a>
            </div>
          </section>
        )}

        {/* Carousel: Consultas */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase" style={{ color: 'var(--au-text-tertiary)' }}>
            Consultas
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {CONSULTAS.map(({ key, label, sub, href, icon: Icon, accent }) => (
              <a
                key={key}
                href={href}
                className="group flex w-[200px] shrink-0 items-start gap-3 rounded-2xl p-4 transition-all active:scale-[0.97]"
                style={{
                  background: 'var(--au-surface)',
                  border: '1px solid var(--au-border)',
                }}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--au-text-primary)' }}>{label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--au-text-tertiary)' }}>{sub}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Carousel: Tu salud */}
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase" style={{ color: 'var(--au-text-tertiary)' }}>
            Tu salud
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {SALUD.map(({ key, label, sub, href, icon: Icon, accent }) => (
              <a
                key={key}
                href={href}
                className="group flex w-[200px] shrink-0 items-start gap-3 rounded-2xl p-4 transition-all active:scale-[0.97]"
                style={{
                  background: 'var(--au-surface)',
                  border: '1px solid var(--au-border)',
                }}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--au-text-primary)' }}>{label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--au-text-tertiary)' }}>{sub}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>

      <BottomNav activeTab="inicio" />

      {user?.id && <IncomingCallHandler patientId={user.id} />}
    </div>
  )
}
