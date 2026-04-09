'use client'

import { Skeleton, SkeletonDashboard } from '@/components/ui/Skeleton'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { useAppointments } from '@/hooks/patients/useAppointments'
import { useJoinTelemedicineAppointment } from '@/hooks/patients/useJoinTelemedicineAppointment'
import type { Locale } from '@/i18n/index'
import {
  Bell,
  Calendar,
  ChevronRight,
  Clock,
  ClipboardList,
  Heart,
  LogOut,
  MessageCircle,
  Pill,
  Settings,
  Shield,
  User,
  Video,
  Brain,
} from 'lucide-react'

function ProgressBar({ value, color }: { value: number; color: 'sky' | 'amber' | 'emerald' }) {
  const trackColors = { sky: 'bg-sky-100', amber: 'bg-amber-100', emerald: 'bg-emerald-100' } as const
  const fillColors = { sky: 'bg-sky-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500' } as const
  return (
    <div className={`mt-2 h-1 overflow-hidden rounded-full ${trackColors[color]}`}>
      <div
        className={`h-full rounded-full ${fillColors[color]} transition-all duration-700`}
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  )
}
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OnboardingChecklist from '@/components/patients/OnboardingChecklist'
import PreConsultationReminder from '@/components/patients/PreConsultationReminder'
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

function isWithin2Hours(scheduledAt: string): boolean {
  const diff = new Date(scheduledAt).getTime() - Date.now()
  return diff > 0 && diff <= 2 * 60 * 60 * 1000
}

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
  const { user, profile, patient, signOut } = usePatientSession()
  const { appointments } = useAppointments()
  const {
    joinAppointment,
    joiningAppointmentId,
    error: joinError,
    clearError: clearJoinError,
  } = useJoinTelemedicineAppointment()
  const [hasHydrated, setHasHydrated] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await signOut()
      window.location.href = '/auth/login'
    } catch {
      setSigningOut(false)
    }
  }, [signOut])

  const firstName = getFirstName(profile, user)
  const freeConsults = patient?.freeConsultationsRemaining ?? 0

  const completedCount = useMemo(() => {
    return appointments.filter(a => a.status === 'completed').length
  }, [appointments])

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  const upcomingAppointment = useMemo(() => {
    if (!hasHydrated) return null
    const live = appointments
      .filter(a => a.status === 'in_progress')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null
    if (live) return live
    const now = new Date()
    return appointments
      .filter(a => a.status === 'scheduled' || a.status === 'confirmed')
      .filter(a => new Date(a.start_time) > now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null
  }, [appointments, hasHydrated])

  const upcomingCount = useMemo(() => {
    if (!hasHydrated) return 0
    const now = new Date()
    return appointments.filter(a =>
      (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.start_time) > now
    ).length
  }, [appointments, hasHydrated])

  const dateLocale = locale === 'pt' ? 'pt-BR' : 'es-AR'
  const greeting = hasHydrated ? getTimeGreeting() : 'Hola'
  const upcomingTelemedicine = upcomingAppointment && isTelemedicineAppointment(upcomingAppointment) ? upcomingAppointment : null
  const canJoinUpcomingTelemedicine = upcomingTelemedicine ? isJoinableTelemedicineAppointment(upcomingTelemedicine) : false

  const anamnesisProgress = patient ? Math.min(
    ((profile?.firstName ? 15 : 0) +
    (profile?.lastName ? 15 : 0) +
    (patient.gender ? 10 : 0) +
    (patient.birthDate ? 10 : 0) +
    (completedCount > 0 ? 25 : 0) +
    (patient.freeConsultationsRemaining !== undefined ? 25 : 0)),
    100
  ) : 0

  const profileProgress = profile ? Math.min(
    ((profile.firstName ? 20 : 0) +
    (profile.lastName ? 20 : 0) +
    (profile.email ? 20 : 0) +
    (profile.phone ? 20 : 0) +
    (patient?.gender ? 10 : 0) +
    (patient?.birthDate ? 10 : 0)),
    100
  ) : 0

  const checklistItems = useMemo(() => [
    { key: 'name', label: 'Nombre y apellido', completed: !!(profile?.firstName && profile?.lastName), href: '/patients/profile' },
    { key: 'email', label: 'Email verificado', completed: !!profile?.email, href: '/patients/settings' },
    { key: 'dob', label: 'Fecha de nacimiento', completed: !!patient?.birthDate, href: '/patients/profile' },
    { key: 'phone', label: 'Telefono de contacto', completed: !!profile?.phone, href: '/patients/profile' },
    { key: 'gender', label: 'Genero', completed: !!patient?.gender, href: '/patients/profile' },
    { key: 'anamnesis', label: 'Completar historia general', completed: anamnesisProgress >= 80, href: '/patients/anamnesis' },
  ], [profile, patient, anamnesisProgress])

  const checklistCompleted = checklistItems.filter(i => i.completed).length
  const hasIncompleteChecklist = checklistItems.some(i => !i.completed)

  const ACTIONS = [
    { key: 'video', label: 'Videoconsulta', sub: 'Conectá en vivo', href: '/patients/appointments?type=telemedicine', icon: Video, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100 hover:border-sky-200' },
    { key: 'turnos', label: 'Mis turnos', sub: 'Agendá citas', href: '/patients/appointments', icon: Calendar, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100 hover:border-violet-200' },
    { key: 'recetas', label: 'Mis Recetas', sub: 'Billetera digital', href: '/patients/medical-history', icon: Pill, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100 hover:border-emerald-200' },
    { key: 'anamnesis', label: 'Historia general', sub: 'Ficha clínica no psiquiátrica', href: '/patients/anamnesis', icon: ClipboardList, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100 hover:border-amber-200' },
    { key: 'psiquiatria_tdah', label: 'Psiquiatría', sub: 'Evaluación farmacológica', href: '/patients/psychiatry-tdah', icon: Brain, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100 hover:border-rose-200' },
    { key: 'preventivo', label: 'Salud Preventiva', sub: 'Controles médicos', href: '/patients/preventive-health', icon: Shield, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100 hover:border-teal-200' },
    { key: 'reproductiva', label: 'Salud Reproductiva', sub: 'IVE/ILE e información', href: '/patients/reproductive-health', icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100 hover:border-rose-200' },
    { key: 'comunidad', label: 'Comunidad', sub: 'Otros pacientes', href: '/patients/community', icon: MessageCircle, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-100 hover:border-fuchsia-200' },
  ] as const

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {!hasHydrated ? (
        <div className="min-h-screen bg-white">
          <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <Skeleton circle className="h-9 w-9" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
              <div className="flex gap-1">
                <Skeleton circle className="h-9 w-9" />
                <Skeleton circle className="h-9 w-9" />
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-2xl">
            <SkeletonDashboard />
          </div>
        </div>
      ) : (
        <>
          <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white shadow-sm shadow-sky-500/20">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{greeting}, {firstName}</p>
                  <p className="text-[11px] text-gray-400">Tu salud, tu control</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                  aria-label="Notificaciones"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  {upcomingCount > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {upcomingCount}
                    </span>
                  )}
                </button>
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setShowMenu(prev => !prev)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                    aria-label="Menú de usuario"
                  >
                    <User className="h-[18px] w-[18px]" />
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                      <a href="/patients/profile" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        <User className="h-4 w-4 text-gray-400" /> Perfil
                      </a>
                      <a href="/patients/settings" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        <Settings className="h-4 w-4 text-gray-400" /> Configuración
                      </a>
                      <div className="mx-3 my-1 border-t border-gray-100" />
                      <button type="button" onClick={handleSignOut} disabled={signingOut} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                        <LogOut className="h-4 w-4" /> {signingOut ? 'Cerrando...' : 'Cerrar sesión'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-2xl px-5 pb-28 pt-5">
            {upcomingAppointment ? (
              <section className="mb-6">
                {canJoinUpcomingTelemedicine ? (
                  <button
                    type="button"
                    onClick={() => { if (!upcomingTelemedicine) return; clearJoinError(); void joinAppointment(upcomingTelemedicine.id) }}
                    disabled={joiningAppointmentId === upcomingTelemedicine?.id}
                    className="group block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 p-5 text-left shadow-lg shadow-sky-500/20 transition-all hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        HOY
                      </span>
                      <span className="text-sm text-sky-100">
                        {new Intl.DateTimeFormat(dateLocale, { hour: '2-digit', minute: '2-digit' }).format(new Date(upcomingAppointment.start_time))}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-white">
                      {upcomingAppointment.doctor ? `Dr. ${upcomingAppointment.doctor.first_name ?? ''} ${upcomingAppointment.doctor.last_name ?? ''}`.trim() : 'Consulta programada'}
                    </h2>
                    <p className="mt-0.5 text-sm text-sky-100">
                      {upcomingAppointment.doctor?.specialty ?? 'General'} · Videoconsulta
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white py-3 font-semibold text-sky-600 transition-colors group-hover:bg-sky-50">
                      <Video className="h-4 w-4" />
                      {joiningAppointmentId === upcomingTelemedicine?.id ? 'Abriendo sala...' : 'Entrar a la consulta'}
                    </div>
                  </button>
                ) : (
                  <a
                    href={upcomingTelemedicine ? buildPatientTelemedicineEntryUrl(upcomingTelemedicine.id) : '/patients/appointments'}
                    className="group block overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 p-5 shadow-lg shadow-sky-500/20 transition-all hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.98]"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                        Próxima consulta
                      </span>
                      <ChevronRight className="h-4 w-4 text-sky-200 transition-transform group-hover:translate-x-1" />
                    </div>
                    <h2 className="text-xl font-bold text-white">
                      {upcomingAppointment.doctor ? `Dr. ${upcomingAppointment.doctor.first_name ?? ''} ${upcomingAppointment.doctor.last_name ?? ''}`.trim() : 'Consulta programada'}
                    </h2>
                    <p className="mt-0.5 text-sm text-sky-100">
                      {upcomingAppointment.doctor?.specialty ?? 'General'}
                      {upcomingTelemedicine ? ' · Videoconsulta' : ''}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-sm text-sky-100">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Intl.DateTimeFormat(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(upcomingAppointment.start_time))}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {new Intl.DateTimeFormat(dateLocale, { hour: '2-digit', minute: '2-digit' }).format(new Date(upcomingAppointment.start_time))}
                      </span>
                    </div>
                  </a>
                )}
                {joinError && canJoinUpcomingTelemedicine && (
                  <p className="mt-3 text-sm text-red-600">{joinError}</p>
                )}
              </section>
            ) : (
              <section className="mb-6">
                <a href="/patients/anamnesis" className="block rounded-2xl border border-gray-100 bg-gray-50/50 p-5 transition-all hover:border-gray-200 active:scale-[0.98]">
                  <p className="text-base leading-relaxed text-gray-500">
                    <span className="font-semibold text-gray-900">{firstName}</span>, completá tu historia clínica para que tu próximo médico te atienda{' '}
                    <span className="font-semibold text-gray-900">conociendo tu historia desde el primer minuto</span>.
                  </p>
                  {freeConsults > 0 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      🎁 {freeConsults} {freeConsults === 1 ? 'consulta gratuita' : 'consultas gratuitas'}
                    </div>
                  )}
                </a>
              </section>
            )}

            {upcomingTelemedicine && isWithin2Hours(upcomingTelemedicine.start_time) && (
              <PreConsultationReminder
                doctorName={
                  upcomingTelemedicine.doctor
                    ? `Dr. ${upcomingTelemedicine.doctor.first_name ?? ''} ${upcomingTelemedicine.doctor.last_name ?? ''}`.trim()
                    : 'Tu médico'
                }
                specialty={upcomingTelemedicine.doctor?.specialty ?? 'General'}
                scheduledAt={upcomingTelemedicine.start_time}
                appointmentId={upcomingTelemedicine.id}
                locale={dateLocale}
              />
            )}

            <section className="mb-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Tu progreso</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                  <p className="text-[11px] font-medium text-gray-400">Anamnesis</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{anamnesisProgress}%</p>
                  <ProgressBar value={anamnesisProgress} color="sky" />
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                  <p className="text-[11px] font-medium text-gray-400">Perfil</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{profileProgress}%</p>
                  <ProgressBar value={profileProgress} color="amber" />
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-[11px] font-medium text-gray-400">Consultas</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{freeConsults > 0 ? `${freeConsults} gratis` : `${completedCount}`}</p>
                  <ProgressBar value={freeConsults > 0 ? 100 : Math.min(completedCount * 20, 100)} color="emerald" />
                </div>
              </div>
            </section>

            {hasIncompleteChecklist && (
              <OnboardingChecklist
                items={checklistItems}
                completedCount={checklistCompleted}
                totalCount={checklistItems.length}
              />
            )}

            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Acciones rápidas</h2>
              <div className="grid grid-cols-2 gap-3">
                {ACTIONS.map(({ key, label, sub, href, icon: Icon, color, bg, border }) => (
                  <a
                    key={key}
                    href={href}
                    className={`group flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-sm active:scale-[0.97] ${border}`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                      <Icon className={`h-[18px] w-[18px] ${color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{label}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          </main>

        </>
      )}
    </div>
  )
}
