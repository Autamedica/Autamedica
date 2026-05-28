'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  Bell, Menu, Video, Calendar, FileText, Brain,
  Heart, Shield, Users,
  Check, AlertCircle, ArrowRight,
  LogOut, Settings, User,
} from 'lucide-react'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { useAppointments } from '@/hooks/patients/useAppointments'
import { useJoinTelemedicineAppointment } from '@/hooks/patients/useJoinTelemedicineAppointment'
import {
  isJoinableTelemedicineAppointment,
  isTelemedicineAppointment,
} from '@/lib/patients/lib/telemedicine-entry'
import type { Locale } from '@/i18n/index'
import { PatientDoctorChat } from '@/components/patients/chat/PatientDoctorChat'
import { PreconsultationVoiceAssistant } from '@/components/patients/PreconsultationVoiceAssistant'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

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

interface PatientsHomePageProps {
  locale?: Locale
}

const SERVICES = [
  { icon: Video, label: 'Médico online', href: '/patients/appointments?type=telemedicine' },
  { icon: Calendar, label: 'Mi agenda', href: '/patients/appointments' },
  { icon: FileText, label: 'Mis medicamentos', href: '/patients/medical-history' },
  { icon: Heart, label: 'Mi historial de salud', href: '/patients/anamnesis' },
  { icon: Brain, label: 'Salud mental', href: '/patients/psychiatry' },
  { icon: Shield, label: 'Prevención y chequeos', href: '/patients/preventive-health' },
  { icon: Heart, label: 'Planificación y cuidado', href: '/patients/reproductive-health' },
  { icon: Users, label: 'Foro de pacientes', href: '/patients/community' },
] as const

const BOTTOM_TABS = [
  { icon: Heart, label: 'Inicio', href: '/?portal=patient' },
  { icon: Calendar, label: 'Agenda', href: '/patients/appointments' },
  { icon: Video, label: 'Consultar', href: '/patients/appointments?type=telemedicine' },
  { icon: FileText, label: 'Recetas', href: '/patients/medical-history' },
  { icon: Users, label: 'Comunidad', href: '/patients/community' },
] as const

export default function PatientsHomePage({ locale }: PatientsHomePageProps) {
  const { user, profile, patient, signOut } = usePatientSession()
  const { appointments } = useAppointments()
  const {
    joinAppointment,
    joiningAppointmentId,
    error: joinError,
    clearError: clearJoinError,
  } = useJoinTelemedicineAppointment()

  const [showMenu, setShowMenu] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [isPreconsultationOpen, setIsPreconsultationOpen] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()

  const heroImageY = useTransform(scrollY, [0, 600], [0, 200])
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0])
  const heroScale = useTransform(scrollY, [0, 300], [1, 1.1])
  const headerOpacity = useTransform(scrollY, [0, 100], [0, 1])
  const contentY = useTransform(scrollY, [0, 300], [0, -50])

  useEffect(() => { setHasHydrated(true) }, [])

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
  const dateLocale = locale === 'pt' ? 'pt-BR' : 'es-AR'

  const completedCount = useMemo(() => {
    return appointments.filter(a => a.status === 'completed').length
  }, [appointments])

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

  const anamnesisCompleted = anamnesisProgress >= 80

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

  const upcomingTelemedicine = upcomingAppointment && isTelemedicineAppointment(upcomingAppointment) ? upcomingAppointment : null
  const canJoinUpcomingTelemedicine = upcomingTelemedicine ? isJoinableTelemedicineAppointment(upcomingTelemedicine) : false
  const hasUpcomingAppointment = !!upcomingAppointment

  const checklistItems = useMemo(() => [
    { id: 1, label: 'Nombre y apellido', completed: !!(profile?.firstName && profile?.lastName), link: '/patients/profile' },
    { id: 2, label: 'Email verificado', completed: !!profile?.email, link: '/patients/settings' },
    { id: 3, label: 'Fecha de nacimiento', completed: !!patient?.birthDate, link: '/patients/profile' },
    { id: 4, label: 'Teléfono de contacto', completed: !!profile?.phone, link: '/patients/profile' },
    { id: 5, label: 'Género', completed: !!patient?.gender, link: '/patients/profile' },
    { id: 6, label: 'Historia general completa', completed: anamnesisCompleted, link: '/patients/anamnesis' },
  ], [profile, patient, anamnesisCompleted])

  const incompleteItems = checklistItems.filter(i => !i.completed)
  const greeting = hasHydrated ? getGreeting() : 'Hola'

  return (
    <div ref={containerRef} className="min-h-screen bg-white">
      {/* Fixed Minimal Header - Appears on scroll */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-neutral-100"
        style={{ opacity: headerOpacity }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-sky-500 flex items-center justify-center text-white text-sm font-medium">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-neutral-900">{firstName}</span>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="relative p-2 hover:bg-neutral-50 rounded-lg transition-colors">
              <Bell className="size-5 text-neutral-600" />
              {hasUpcomingAppointment && (
                <span className="absolute top-1.5 right-1.5 size-1.5 bg-sky-500 rounded-full" />
              )}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-neutral-50 rounded-lg transition-colors"
              >
                <Menu className="size-5 text-neutral-600" />
              </button>

              {showMenu && (
                <motion.div
                  className="absolute right-0 mt-2 w-48 bg-white border border-neutral-100 rounded-2xl shadow-2xl overflow-hidden"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", duration: 0.4 }}
                >
                  <a href="/patients/profile" className="flex items-center gap-2.5 w-full px-4 py-3 text-left text-sm hover:bg-neutral-50 transition-colors">
                    <User className="h-4 w-4 text-neutral-400" /> Perfil
                  </a>
                  <a href="/patients/settings" className="flex items-center gap-2.5 w-full px-4 py-3 text-left text-sm hover:bg-neutral-50 transition-colors">
                    <Settings className="h-4 w-4 text-neutral-400" /> Configuración
                  </a>
                  <div className="border-t border-neutral-100" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="flex items-center gap-2.5 w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" /> {signingOut ? 'Cerrando...' : 'Cerrar sesión'}
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Hero - Full Canvas Visual Anchor */}
      <motion.section
        className="relative h-[85vh] overflow-hidden"
        style={{ opacity: heroOpacity }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ y: heroImageY, scale: heroScale }}
        >
          <img
            src="https://images.unsplash.com/photo-1758274526671-ad18176acb01?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900/60 via-neutral-900/40 to-transparent" />
        </motion.div>

        <div className="relative h-full max-w-7xl mx-auto px-6 lg:px-12 flex flex-col justify-end pb-20">
          <motion.div
            className="max-w-2xl"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <motion.p
              className="text-white/70 text-sm mb-3 tracking-wide uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {greeting}
            </motion.p>

            <motion.h1
              className="text-white text-5xl lg:text-7xl mb-6 leading-[1.1]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
            >
              {firstName},<br />tu salud en control
            </motion.h1>

            <motion.p
              className="text-white/80 text-lg lg:text-xl mb-10 max-w-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              {anamnesisCompleted
                ? 'Todo listo para tu atención médica'
                : 'Completa tu historia clínica para comenzar'}
            </motion.p>

            <motion.a
              href={anamnesisCompleted ? '/patients/appointments?type=telemedicine' : '/patients/anamnesis'}
              className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-neutral-900 rounded-full text-base font-medium hover:bg-neutral-50 transition-all"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {anamnesisCompleted ? 'Agendar consulta' : 'Completar perfil'}
              <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
            </motion.a>
          </motion.div>
        </div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2">
            <motion.div
              className="w-1 h-2 bg-white/70 rounded-full"
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>
      </motion.section>

      {/* Main Content */}
      <motion.main
        className="relative bg-white"
        style={{ y: contentY }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-24 lg:py-32 space-y-32">

          {/* Status Section */}
          <motion.section
            className="grid lg:grid-cols-2 gap-16 lg:gap-24"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
          >
            <div>
              <motion.div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 ${
                  !anamnesisCompleted ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'
                }`}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                {!anamnesisCompleted ? (
                  <><AlertCircle className="size-3.5" /> Acción requerida</>
                ) : (
                  <><Check className="size-3.5" /> Activo</>
                )}
              </motion.div>

              <motion.h2
                className="text-4xl lg:text-5xl text-neutral-900 mb-6 leading-tight"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                {!anamnesisCompleted
                  ? 'Completa tu historia clínica'
                  : 'Todo listo para tu atención'}
              </motion.h2>

              <motion.p
                className="text-lg text-neutral-500 mb-10 max-w-md"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
              >
                {!anamnesisCompleted
                  ? 'Para ofrecerte la mejor atención médica'
                  : 'Accede a consultas, recetas y más'}
              </motion.p>

              <motion.a
                href={!anamnesisCompleted ? '/patients/anamnesis' : '/patients/appointments?type=telemedicine'}
                className="group inline-flex items-center gap-2 px-7 py-4 bg-neutral-900 text-white rounded-full hover:bg-neutral-800 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {!anamnesisCompleted ? 'Completar ahora' : 'Agendar consulta'}
                <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
              </motion.a>
            </div>

            {/* Metrics */}
            <div className="space-y-10">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-end justify-between mb-3">
                  <span className="text-neutral-500">Historia clínica</span>
                  <span className="text-5xl text-neutral-900 tabular-nums">{anamnesisProgress}</span>
                </div>
                <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-sky-500 rounded-full"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${anamnesisProgress}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.5 }}
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
              >
                <div className="flex items-end justify-between mb-3">
                  <span className="text-neutral-500">Perfil completo</span>
                  <span className="text-5xl text-neutral-900 tabular-nums">{profileProgress}</span>
                </div>
                <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-neutral-400 rounded-full"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${profileProgress}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.6 }}
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 }}
              >
                <div className="flex items-end justify-between mb-3">
                  <span className="text-neutral-500">Consultas gratuitas</span>
                  <span className="text-5xl text-sky-600 tabular-nums">{freeConsults}</span>
                </div>
                <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-sky-500 rounded-full"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.min((freeConsults / 5) * 100, 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.7 }}
                  />
                </div>
              </motion.div>
            </div>
          </motion.section>

          {/* Upcoming Appointment */}
          {hasUpcomingAppointment && upcomingAppointment && (
            <motion.section
              className="border-t border-neutral-100 pt-24 lg:pt-32"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
            >
              <motion.div
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-neutral-900 text-white rounded-full text-xs font-medium mb-8"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
              >
                {upcomingAppointment.status === 'in_progress' ? 'EN VIVO' : 'Próxima'}
              </motion.div>

              <div className="grid lg:grid-cols-3 gap-12 lg:gap-16">
                <div className="lg:col-span-2">
                  <motion.h3
                    className="text-4xl lg:text-5xl text-neutral-900 mb-4 leading-tight"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                  >
                    {upcomingAppointment.doctor
                      ? `Dr. ${upcomingAppointment.doctor.first_name ?? ''} ${upcomingAppointment.doctor.last_name ?? ''}`.trim()
                      : 'Consulta programada'}
                  </motion.h3>
                  <motion.p
                    className="text-lg text-neutral-500 mb-8"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                  >
                    {upcomingAppointment.doctor?.specialty ?? 'General'}
                    {upcomingTelemedicine ? ' · Videoconsulta' : ''}
                  </motion.p>

                  <motion.div
                    className="flex flex-col sm:flex-row sm:items-center gap-6"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 }}
                  >
                    <div>
                      <p className="text-sm text-neutral-500 mb-1">Fecha y hora</p>
                      <p className="text-lg text-neutral-900">
                        {new Intl.DateTimeFormat(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(upcomingAppointment.start_time))}
                      </p>
                    </div>

                    {canJoinUpcomingTelemedicine && upcomingTelemedicine && (
                      <motion.button
                        type="button"
                        onClick={() => { clearJoinError(); void joinAppointment(upcomingTelemedicine.id) }}
                        disabled={joiningAppointmentId === upcomingTelemedicine.id}
                        className="group inline-flex items-center gap-2 px-7 py-4 bg-neutral-900 text-white rounded-full hover:bg-neutral-800 transition-colors disabled:opacity-70"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Video className="size-5" />
                        {joiningAppointmentId === upcomingTelemedicine.id ? 'Abriendo sala...' : 'Entrar a la consulta'}
                        <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
                      </motion.button>
                    )}
                  </motion.div>
                  {joinError && canJoinUpcomingTelemedicine && (
                    <p className="mt-3 text-sm text-red-600">{joinError}</p>
                  )}
                </div>

                <motion.div
                  className="flex items-center justify-center lg:justify-end"
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="size-32 rounded-full bg-sky-100 flex items-center justify-center">
                    <Calendar className="size-16 text-sky-600" />
                  </div>
                </motion.div>
              </div>
            </motion.section>
          )}

          {/* Onboarding Checklist */}
          {incompleteItems.length > 0 && (
            <motion.section
              className="border-t border-neutral-100 pt-24 lg:pt-32"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
            >
              <motion.h3
                className="text-3xl lg:text-4xl text-neutral-900 mb-12"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                Completa tu perfil
              </motion.h3>

              <div className="grid lg:grid-cols-2 gap-4">
                {checklistItems.map((item, i) => (
                  <motion.a
                    key={item.id}
                    href={item.link}
                    className="group flex items-center gap-4 p-6 border border-neutral-200 rounded-2xl hover:border-neutral-900 transition-all"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    whileHover={{ y: -4 }}
                  >
                    <div className={`size-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      item.completed
                        ? 'bg-neutral-900 border-neutral-900'
                        : 'border-neutral-300 group-hover:border-neutral-900'
                    }`}>
                      {item.completed && <Check className="size-4 text-white" />}
                    </div>
                    <span className={`flex-1 transition-colors ${
                      item.completed ? 'text-neutral-400 line-through' : 'text-neutral-900'
                    }`}>
                      {item.label}
                    </span>
                    {!item.completed && (
                      <ArrowRight className="size-5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all" />
                    )}
                  </motion.a>
                ))}
              </div>
            </motion.section>
          )}

          {/* Services Grid */}
          <motion.section
            className="border-t border-neutral-100 pt-24 lg:pt-32"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <motion.h3
              className="text-3xl lg:text-4xl text-neutral-900 mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              ¿Cómo te ayudamos?
            </motion.h3>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {SERVICES.map((action, i) => (
                <motion.a
                  key={action.label}
                  href={action.href}
                  onClick={(e) => {
                    if (action.label === 'Médico online') {
                      e.preventDefault()
                      setIsPreconsultationOpen(true)
                    }
                  }}
                  className="group p-8 text-left border border-neutral-200 rounded-2xl hover:border-neutral-900 hover:bg-neutral-50 transition-all cursor-pointer"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                >
                  <action.icon className="size-8 text-neutral-400 group-hover:text-neutral-900 mb-6 transition-colors" />
                  <p className="text-neutral-900 group-hover:text-neutral-900">
                    {action.label}
                  </p>
                </motion.a>
              ))}
            </div>
          </motion.section>

          <div className="h-32" />
        </div>
      </motion.main>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-neutral-100 z-50">
        <div className="flex items-center justify-around px-4 py-3">
          {BOTTOM_TABS.map((tab) => (
            <motion.a
              key={tab.label}
              href={tab.href}
              onClick={(e) => {
                if (tab.label === 'Consultar') {
                  e.preventDefault()
                  setIsPreconsultationOpen(true)
                }
              }}
              className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-neutral-100 transition-colors min-w-[60px] cursor-pointer"
              whileTap={{ scale: 0.95 }}
            >
              <tab.icon className="size-5 text-neutral-600" />
              <span className="text-xs text-neutral-600">{tab.label}</span>
            </motion.a>
          ))}
        </div>
      </nav>

      {/* Floating P2P Chat */}
      <PatientDoctorChat />

      <PreconsultationVoiceAssistant
        isOpen={isPreconsultationOpen}
        onClose={() => setIsPreconsultationOpen(false)}
        onComplete={(_summary) => {
          setIsPreconsultationOpen(false)
          // Redirigir a la sala de espera virtual o appointments con el resumen guardado
          window.location.href = '/patients/appointments?type=telemedicine&preconsultation=completed'
        }}
      />
    </div>
  )
}
