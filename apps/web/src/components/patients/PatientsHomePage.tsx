"use client"

import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { useAppointments } from '@/hooks/patients/useAppointments'
import { getClientI18n } from '@/i18n/index'
import type { Locale } from '@/i18n/index'
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Heart,
  MapPin,
  MessageSquare,
  Search,
  Stethoscope,
  TrendingUp,
  Video,
  Activity,
  Shield,
  Bell,
  User,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { IncomingCallHandler } from '@/components/patients/calls/IncomingCallHandler'

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

const SPECIALTIES = [
  { key: 'general', label: 'Medicina General', icon: Stethoscope, color: 'bg-blue-500' },
  { key: 'cardio', label: 'Cardiología', icon: Heart, color: 'bg-red-500' },
  { key: 'derma', label: 'Dermatología', icon: Shield, color: 'bg-purple-500' },
  { key: 'psych', label: 'Psicología', icon: MessageSquare, color: 'bg-teal-500' },
  { key: 'nutrition', label: 'Nutrición', icon: Activity, color: 'bg-green-500' },
  { key: 'traumato', label: 'Traumatología', icon: TrendingUp, color: 'bg-orange-500' },
]

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

interface PatientsHomePageProps {
  locale?: Locale
}

export default function PatientsHomePage({ locale }: PatientsHomePageProps) {
  const _i18n = getClientI18n(locale ?? 'es')
  const { user, profile, patient } = usePatientSession()
  const { appointments } = useAppointments()
  const firstName = getFirstName(profile, user)
  const [searchQuery, setSearchQuery] = useState('')

  const upcomingAppointment = useMemo(() => {
    const now = new Date()
    return appointments
      .filter(a => a.status === 'scheduled' || a.status === 'confirmed')
      .filter(a => new Date(a.scheduled_at) > now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null
  }, [appointments])

  const completedCount = appointments.filter(a => a.status === 'completed').length
  const upcomingCount = appointments.filter(a =>
    (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.scheduled_at) > new Date()
  ).length

  const hasBirthDate = Boolean(patient?.birthDate)
  const hasGender = Boolean(patient?.gender)
  const hasEmergencyContact = Boolean(patient?.emergencyContact)
  const profileCompletion = Math.round(
    ([hasBirthDate, hasGender, hasEmergencyContact].filter(Boolean).length / 3) * 100
  )

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-gray-900">{getTimeGreeting()}, {firstName}</p>
              <p className="text-xs text-gray-500">Tu salud, tu control</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
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
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Perfil"
            >
              <User className="h-5 w-5" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">

        {/* Search Bar — Airbnb style */}
        <section className="pb-6 pt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar especialidad, médico o servicio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-4 pl-12 pr-4 text-base text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </section>

        {/* Specialties — horizontal scroll pills */}
        <section className="pb-8">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {SPECIALTIES.map((spec) => {
              const Icon = spec.icon
              return (
                <a
                  key={spec.key}
                  href={`/patients/appointments?specialty=${spec.key}`}
                  className="flex shrink-0 flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md active:scale-95"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${spec.color} text-white`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="whitespace-nowrap text-xs font-medium text-gray-700">{spec.label}</span>
                </a>
              )
            })}
          </div>
        </section>

        {/* Upcoming Appointment Card — hero card */}
        {upcomingAppointment ? (
          <section className="pb-8">
            <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-xl shadow-blue-500/20 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <p className="mb-1 text-sm font-medium text-blue-200">Próxima consulta</p>
                  <h2 className="text-2xl font-bold">
                    {upcomingAppointment.doctor
                      ? `Dr. ${upcomingAppointment.doctor.first_name ?? ''} ${upcomingAppointment.doctor.last_name ?? ''}`
                      : 'Consulta programada'}
                  </h2>
                  {upcomingAppointment.doctor?.specialty && (
                    <p className="mt-1 text-sm text-blue-200">{upcomingAppointment.doctor.specialty}</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-blue-100">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'es-AR', {
                        weekday: 'short', day: 'numeric', month: 'short',
                      }).format(new Date(upcomingAppointment.scheduled_at))}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'es-AR', {
                        hour: '2-digit', minute: '2-digit',
                      }).format(new Date(upcomingAppointment.scheduled_at))}
                    </span>
                    {upcomingAppointment.type === 'telemedicine' && (
                      <span className="flex items-center gap-1.5">
                        <Video className="h-4 w-4" />
                        Videoconsulta
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  {upcomingAppointment.type === 'telemedicine' && upcomingAppointment.meeting_url && (
                    <a
                      href={upcomingAppointment.meeting_url}
                      className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-600 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
                    >
                      <Video className="h-4 w-4" />
                      Ingresar
                    </a>
                  )}
                  <a
                    href="/patients/appointments"
                    className="flex items-center gap-2 rounded-xl bg-white/20 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/30 active:scale-95"
                  >
                    Ver detalle
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="pb-8">
            <div className="overflow-hidden rounded-3xl border border-dashed border-gray-200 bg-gray-50/50 p-6 sm:p-8">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-500">
                  <Calendar className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900">Sin consultas programadas</h2>
                  <p className="mt-1 text-sm text-gray-500">Agendá tu primera videoconsulta con un profesional de salud.</p>
                </div>
                <a
                  href="/patients/appointments"
                  className="shrink-0 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md active:scale-95"
                >
                  Agendar consulta
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Stats Row */}
        <section className="pb-8">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{upcomingCount}</p>
                  <p className="text-xs text-gray-500">Pendientes</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
                  <p className="text-xs text-gray-500">Completadas</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{profileCompletion}%</p>
                  <p className="text-xs text-gray-500">Perfil</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Profile Completion Banner — only if < 100% */}
        {profileCompletion < 100 && (
          <section className="pb-8">
            <a
              href="/patients/anamnesis"
              className="group flex items-center gap-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 transition-all hover:border-amber-200 hover:shadow-sm"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 transition-colors group-hover:bg-amber-200">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">Completá tu anamnesis</p>
                <p className="text-xs text-amber-700">
                  Tu historia clínica al {profileCompletion}%. Completarla mejora cada consulta.
                </p>
              </div>
              <div className="hidden sm:block">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-amber-200">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-700"
                    style={{ width: `${profileCompletion}%` }}
                  />
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-amber-400 transition-transform group-hover:translate-x-1" />
            </a>
          </section>
        )}

        {/* Quick Services Grid — Rappi-style cards */}
        <section className="pb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Servicios</h2>
            <a href="/patients/appointments" className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700">
              Ver todos
            </a>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <a
              href="/patients/appointments"
              className="group flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-blue-100 hover:shadow-lg hover:shadow-blue-500/10 active:scale-95"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                <Video className="h-7 w-7" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">Videoconsulta</p>
                <p className="mt-0.5 text-xs text-gray-500">Consulta online</p>
              </div>
            </a>

            <a
              href="/patients/anamnesis"
              className="group flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-500/10 active:scale-95"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                <ClipboardList className="h-7 w-7" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">Anamnesis</p>
                <p className="mt-0.5 text-xs text-gray-500">Historia clínica</p>
              </div>
            </a>

            <a
              href="/patients/medical-history"
              className="group flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-100 hover:shadow-lg hover:shadow-emerald-500/10 active:scale-95"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                <FileText className="h-7 w-7" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">Historial</p>
                <p className="mt-0.5 text-xs text-gray-500">Registros médicos</p>
              </div>
            </a>

            <a
              href="/patients/preventive-health"
              className="group flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-rose-100 hover:shadow-lg hover:shadow-rose-500/10 active:scale-95"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition-colors group-hover:bg-rose-600 group-hover:text-white">
                <Heart className="h-7 w-7" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">Prevención</p>
                <p className="mt-0.5 text-xs text-gray-500">Salud preventiva</p>
              </div>
            </a>
          </div>
        </section>

        {/* Recent Activity */}
        {appointments.length > 0 && (
          <section className="pb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Actividad reciente</h2>
              <a href="/patients/appointments" className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700">
                Ver todo
              </a>
            </div>
            <div className="space-y-3">
              {appointments.slice(0, 3).map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md"
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    apt.status === 'completed' ? 'bg-green-50 text-green-600'
                    : apt.status === 'cancelled' ? 'bg-gray-100 text-gray-400'
                    : 'bg-blue-50 text-blue-600'
                  }`}>
                    {apt.type === 'telemedicine' ? <Video className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {apt.doctor
                        ? `Dr. ${apt.doctor.first_name ?? ''} ${apt.doctor.last_name ?? ''}`
                        : apt.reason ?? 'Consulta médica'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'es-AR', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      }).format(new Date(apt.scheduled_at))}
                      {apt.doctor?.specialty && ` · ${apt.doctor.specialty}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    apt.status === 'completed' ? 'bg-green-50 text-green-700'
                    : apt.status === 'cancelled' ? 'bg-gray-100 text-gray-500'
                    : apt.status === 'confirmed' ? 'bg-blue-50 text-blue-700'
                    : 'bg-amber-50 text-amber-700'
                  }`}>
                    {apt.status === 'completed' ? 'Completada'
                    : apt.status === 'cancelled' ? 'Cancelada'
                    : apt.status === 'confirmed' ? 'Confirmada'
                    : apt.status === 'scheduled' ? 'Agendada'
                    : apt.status === 'in_progress' ? 'En curso'
                    : apt.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Health Tips — editorial cards */}
        <section className="pb-8">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Para tu bienestar</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href="/patients/preventive-health"
              className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="h-32 bg-gradient-to-br from-teal-400 to-cyan-500" />
              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-teal-600">Prevención</p>
                <h3 className="mt-1 text-sm font-semibold text-gray-900 transition-colors group-hover:text-teal-700">
                  Chequeos preventivos según tu edad y género
                </h3>
                <p className="mt-2 text-xs text-gray-500">Descubrí qué estudios te corresponden este año.</p>
              </div>
            </a>
            <a
              href="/patients/community"
              className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="h-32 bg-gradient-to-br from-violet-400 to-purple-500" />
              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-violet-600">Comunidad</p>
                <h3 className="mt-1 text-sm font-semibold text-gray-900 transition-colors group-hover:text-violet-700">
                  Conectá con otros pacientes
                </h3>
                <p className="mt-2 text-xs text-gray-500">Compartí experiencias y encontrá apoyo en la comunidad.</p>
              </div>
            </a>
          </div>
        </section>
      </main>

      {/* Bottom Navigation — Mobile Rappi-style */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/90 backdrop-blur-lg sm:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around py-2">
          <a href="/" className="flex flex-col items-center gap-0.5 px-3 py-1 text-blue-600">
            <Activity className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Inicio</span>
          </a>
          <a href="/patients/appointments" className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-400 transition-colors hover:text-gray-700">
            <Calendar className="h-5 w-5" />
            <span className="text-[10px] font-medium">Citas</span>
          </a>
          <a href="/patients/appointments" className="flex flex-col items-center gap-0.5 px-3 py-1">
            <div className="flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/30">
              <Video className="h-6 w-6" />
            </div>
            <span className="-mt-2 text-[10px] font-semibold text-blue-600">Consultar</span>
          </a>
          <a href="/patients/medical-history" className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-400 transition-colors hover:text-gray-700">
            <FileText className="h-5 w-5" />
            <span className="text-[10px] font-medium">Historial</span>
          </a>
          <a href="/patients/profile" className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-400 transition-colors hover:text-gray-700">
            <User className="h-5 w-5" />
            <span className="text-[10px] font-medium">Perfil</span>
          </a>
        </div>
      </nav>

      {/* Incoming call listener */}
      {user?.id && <IncomingCallHandler patientId={user.id} />}
    </div>
  )
}
