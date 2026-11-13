'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import {
  Bell, Menu, Video, Calendar, FileText, Brain,
  Heart, Shield, Users,
  Check, AlertCircle, ArrowRight,
  LogOut, Settings, User,
  Wallet, Plus, Loader2, CreditCard, Gift, Coins, Sparkles, X, Stethoscope, Zap, MapPin,
} from 'lucide-react'
import { PixCheckoutModal } from '@/components/payments/PixCheckoutModal'
import { fetchApi } from '@/lib/api-client'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { useAppointments } from '@/hooks/patients/useAppointments'
import { useJoinTelemedicineAppointment } from '@/hooks/patients/useJoinTelemedicineAppointment'
import {
  isJoinableTelemedicineAppointment,
  isTelemedicineAppointment,
} from '@/lib/patients/lib/telemedicine-entry'
import { getClientI18n, type Locale } from '@/i18n/index'
import { PatientDoctorChat } from '@/components/patients/chat/PatientDoctorChat'
import type { DoctorOption } from '@/components/patients/appointments/appointment-modal.types'
import { AvailableDoctorsCarousel } from '@/components/ui/available-doctors-carousel'
import type { Doctor } from '@/components/ui/available-doctors-carousel/types'

function getGreeting(dict: ReturnType<typeof getClientI18n>['dict']): string {
  const hour = new Date().getHours()
  if (hour < 12) return dict.patientPortal.greetings.morning
  if (hour < 19) return dict.patientPortal.greetings.afternoon
  return dict.patientPortal.greetings.evening
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

type PatientWalletSummary = {
  balance: {
    available_credit_cents: number
    locked_credit_cents: number
    total_credit_cents: number
    currency: string
  }
}

interface HealthReserveData {
  patient_id: string
  benefit_balance: number
  max_cap_credits: number
  status: string
  subscription_tier: 'free' | 'cuidado'
  subscription_status: string
}

function formatWalletBalance(cents: number | null | undefined, locale?: Locale): string {
  const amount = cents ? cents / 100 : 0
  const currencyCode = locale === 'pt' ? 'BRL' : 'ARS'
  const numberLocale = locale === 'pt' ? 'pt-BR' : 'es-AR'
  return new Intl.NumberFormat(numberLocale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount)
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

  const { dict } = getClientI18n(locale ?? 'es')

  const [showMenu, setShowMenu] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [walletSummary, setWalletSummary] = useState<PatientWalletSummary | null>(null)
  const [reserveData, setReserveData] = useState<HealthReserveData | null>(null)
  const [showReservaBanner, setShowReservaBanner] = useState(true)
  const [showPixSubscriptionModal, setShowPixSubscriptionModal] = useState(false)
  const [isWalletPopoverOpen, setIsWalletPopoverOpen] = useState(false)
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false)
  const [topupAmount, setTopupAmount] = useState('')
  const [topupLoading, setTopupLoading] = useState(false)
  const [topupError, setTopupError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()

  const headerOpacity = useTransform(scrollY, [0, 100], [0, 1])

  useEffect(() => { setHasHydrated(true) }, [])

  useEffect(() => {
    if (hasHydrated && user) {
      fetchApi<PatientWalletSummary>('/api/patients/wallet')
        .then(setWalletSummary)
        .catch(err => console.error('Error fetching wallet balance:', err))

      fetchApi<{ success: boolean; data: HealthReserveData }>('/api/patients/reserva-saude')
        .then(res => {
          if (res?.data) setReserveData(res.data)
        })
        .catch(err => console.error('Error fetching health reserve subscription:', err))
    }
  }, [hasHydrated, user])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Auto-collapse Assinatura banner after 5 seconds
  useEffect(() => {
    if (!showReservaBanner) return
    const timer = setTimeout(() => setShowReservaBanner(false), 5000)
    return () => clearTimeout(timer)
  }, [showReservaBanner])

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await signOut()
      window.location.href = '/auth/login'
    } catch {
      setSigningOut(false)
    }
  }, [signOut])

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseFloat(topupAmount)
    if (isNaN(parsed) || parsed <= 0) return

    setTopupLoading(true)
    setTopupError(null)

    try {
      const response = await fetchApi<{ checkoutUrl: string }>('/api/patients/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amountArs: parsed }),
      })

      if (response.checkoutUrl) {
         window.location.href = response.checkoutUrl
      } else {
         throw new Error('No se recibió la URL de checkout')
      }
    } catch (err) {
      console.error('Topup request error:', err)
      setTopupError(err instanceof Error ? err.message : 'Error al procesar la recarga')
    } finally {
      setTopupLoading(false)
    }
  }

  const firstName = getFirstName(profile, user)
  const greeting = hasHydrated ? getGreeting(dict) : (dict.patientPortal.greetings.hello ?? 'Hola')
  const freeConsults = patient?.freeConsultationsRemaining ?? 0
  const getWalletFabText = () => {
    if (freeConsults > 0) {
      return `${freeConsults} ${freeConsults === 1 ? 'consulta' : 'consultas'} ${dict.patientPortal.metrics.freeConsultations.toLowerCase()}`
    }
    const balanceCents = walletSummary?.balance.available_credit_cents ?? 0
    return formatWalletBalance(balanceCents, locale)
  }
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

  const services = useMemo(() => [
    {
      label: locale === 'pt' ? 'Farmácia e Receita Rápida' : 'Farmacia y Receta Exprés',
      desc: locale === 'pt' ? 'Atendimento imediato por plantão para emitir sua receita no balcão' : 'Atención inmediata de guardia para emitir tu receta en mostrador',
      href: '/farmacia/solicitar',
      bgImage: '/images/cards/card_bg_recetas.jpg',
      iconImage: '/images/cards/icon_recetas.jpg',
      icon: Stethoscope,
    },
    {
      label: dict.patientPortal.services.onlineDoctor,
      desc: dict.patientPortal.services.onlineDoctorDesc,
      href: '/patients/appointments?type=telemedicine',
      bgImage: '/images/cards/card_bg_medico_online.jpg',
      iconImage: '/images/cards/icon_medico_online.jpg',
      icon: Video,
    },
    {
      label: dict.patientPortal.services.subscription,
      desc: dict.patientPortal.services.subscriptionDesc,
      href: '/patients/reserva-saude',
      bgImage: '/images/cards/card_bg_suscripcion.jpg',
      iconImage: '/images/cards/icon_suscripcion.jpg',
      icon: Coins,
    },
    {
      label: dict.patientPortal.services.mySchedule,
      desc: dict.patientPortal.services.myScheduleDesc,
      href: '/patients/appointments',
      bgImage: '/images/cards/card_bg_agenda.jpg',
      iconImage: '/images/cards/icon_agenda.jpg',
      icon: Calendar,
    },
    {
      label: dict.patientPortal.services.myPrescriptions,
      desc: dict.patientPortal.services.myPrescriptionsDesc,
      href: '/patients/medical-history',
      bgImage: '/images/cards/card_bg_recetas.jpg',
      iconImage: '/images/cards/icon_recetas.jpg',
      icon: FileText,
    },
    {
      label: dict.patientPortal.services.myHistory,
      desc: dict.patientPortal.services.myHistoryDesc,
      href: '/patients/anamnesis',
      bgImage: '/images/cards/card_bg_historial.jpg',
      iconImage: '/images/cards/icon_historial.jpg',
      icon: Heart,
    },
    {
      label: dict.patientPortal.services.mentalHealth,
      desc: dict.patientPortal.services.mentalHealthDesc,
      href: '/patients/psychiatry',
      bgImage: '/images/cards/card_bg_salud_mental.jpg',
      icon: Brain,
    },
    {
      label: dict.patientPortal.services.prevention,
      desc: dict.patientPortal.services.preventionDesc,
      href: '/patients/preventive-health',
      bgImage: '/images/cards/card_bg_prevencion.jpg',
      icon: Shield,
    },
    {
      label: dict.patientPortal.services.reproductiveHealth,
      desc: dict.patientPortal.services.reproductiveHealthDesc,
      href: '/patients/reproductive-health',
      bgImage: '/images/cards/card_bg_salud_reproductiva.jpg',
      icon: Heart,
    },
    {
      label: dict.patientPortal.services.community,
      desc: dict.patientPortal.services.communityDesc,
      href: '/patients/community',
      bgImage: '/images/cards/card_bg_comunidad.jpg',
      icon: Users,
    },
  ], [dict])

  const bottomTabs = useMemo(() => [
    { icon: Heart, label: dict.patientPortal.tabs.inicio, href: '/?portal=patient' },
    { icon: Calendar, label: dict.patientPortal.tabs.agenda, href: '/patients/appointments' },
    { icon: Video, label: dict.patientPortal.tabs.consultar, href: '/patients/appointments?type=telemedicine' },
    { icon: FileText, label: dict.patientPortal.tabs.recetas, href: '/patients/medical-history' },
    { icon: Users, label: dict.patientPortal.tabs.comunidad, href: '/patients/community' },
  ], [dict])

  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [doctorsLoading, setDoctorsLoading] = useState(false)

  useEffect(() => {
    if (hasHydrated) {
      setDoctorsLoading(true)
      fetchApi<DoctorOption[]>('/api/patients/doctors')
        .then((data) => {
          setDoctors((data ?? []).filter(d => 
            !(d.license_number?.startsWith('PENDING') || d.license_number === 'PENDING') &&
            !d.license_number?.includes('DEMO') &&
            d.has_availability !== false
          ))
        })
        .catch((err) => console.error('Error fetching doctors:', err))
        .finally(() => setDoctorsLoading(false))
    }
  }, [hasHydrated])

  const carouselDoctors: Doctor[] = useMemo(() => {
    return doctors.map((doc) => ({
      id: doc.id,
      name: doc.label,
      photoUrl: doc.avatar_url?.trim() ? doc.avatar_url : undefined,
      specialty: doc.specialty || (locale === 'pt' ? 'Clínico Geral' : 'Médico General'),
      city: doc.license_pills?.[0]?.jurisdiction,
      matricula: doc.license_number || '',
      price: doc.consultation_fee ?? undefined,
      rating: doc.overall_score ? Number(doc.overall_score) : undefined,
      languages: undefined,
      experienceYears: undefined,
      hospital: undefined,
      university: undefined,
      availability: doc.has_availability ? 'today' : 'tomorrow',
      verified: true,
    }))
  }, [doctors, locale])

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
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-900">{firstName}</span>
              {reserveData && (
                <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  reserveData.subscription_tier === 'cuidado'
                    ? reserveData.subscription_status === 'past_due'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                    : 'bg-neutral-100 text-neutral-600'
                }`}>
                  {reserveData.subscription_tier === 'cuidado' ? (
                    <Sparkles className="size-3 text-cyan-600" />
                  ) : (
                    <Coins className="size-3 text-neutral-400" />
                  )}
                  {reserveData.subscription_tier === 'cuidado'
                    ? (reserveData.subscription_status === 'past_due' ? dict.patientPortal.subscription.planCuidadoPastDue : dict.patientPortal.subscription.planCuidadoActive)
                    : dict.patientPortal.subscription.planFree}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón de Saldo en Header */}
            {walletSummary && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsWalletPopoverOpen(!isWalletPopoverOpen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200/80 border border-stone-200 text-stone-800 text-xs font-semibold transition-all shadow-2xs"
                  title="Ver saldo disponível"
                >
                  <Wallet className="size-3.5 text-stone-600" />
                  <span>{getWalletFabText()}</span>
                </button>

                <AnimatePresence>
                  {isWalletPopoverOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-72 overflow-hidden rounded-3xl border border-stone-100 bg-white p-5 shadow-2xl z-50"
                    >
                      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-stone-100">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                          <Wallet className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                            {dict.patientPortal.wallet.title}
                          </p>
                          <p className="text-xs text-stone-400 font-medium">
                            {dict.patientPortal.wallet.subtitle}
                          </p>
                        </div>
                      </div>

                      {/* Wallet Balance Info Grid */}
                      <div className="space-y-2.5 mb-4">
                        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-stone-50 border border-stone-100">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-stone-400" />
                            <span className="text-xs font-semibold text-stone-600">{dict.patientPortal.wallet.balanceAvailable}</span>
                          </div>
                          <span className="text-sm font-bold text-stone-900">
                            {formatWalletBalance(walletSummary.balance.available_credit_cents, locale)}
                          </span>
                        </div>

                        <div className={`flex items-center justify-between p-2.5 rounded-2xl border ${
                          freeConsults > 0 ? 'bg-stone-50 border-stone-200' : 'bg-stone-50/40 border-stone-100 opacity-60'
                        }`}>
                          <div className="flex items-center gap-2">
                            <Gift className={`h-4 w-4 ${freeConsults > 0 ? 'text-stone-700' : 'text-stone-400'}`} />
                            <span className="text-xs font-semibold text-stone-600">{dict.patientPortal.wallet.giftConsults}</span>
                          </div>
                          <span className={`text-sm font-bold ${freeConsults > 0 ? 'text-stone-900' : 'text-stone-400'}`}>
                            {freeConsults > 0 ? `${freeConsults} ${dict.patientPortal.wallet.available}` : dict.patientPortal.wallet.none}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <a
                          href="/patients/reserva-saude"
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl bg-stone-950 py-3 text-xs font-bold text-white transition hover:bg-stone-800"
                        >
                          <Coins className="h-3.5 w-3.5" />
                          {dict.patientPortal.wallet.reserveSaudeBtn}
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setIsWalletPopoverOpen(false);
                            setIsTopupModalOpen(true);
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl bg-stone-100 py-3 text-xs font-semibold text-stone-800 hover:bg-stone-200/80 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {dict.patientPortal.wallet.topupBtn}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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
                    <Settings className="h-4 w-4 text-neutral-400" /> Configuração
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

      {/* Immediate-care hero: primary patient action, visible without scrolling */}
      <section
        aria-labelledby="patient-home-immediate-title"
        className="max-w-7xl mx-auto px-6 lg:px-12 pt-5 md:pt-8"
      >
        <div
          className="relative isolate overflow-hidden rounded-[2rem] border bg-white shadow-sm"
          style={{ borderColor: 'color-mix(in srgb, var(--portal-patients) 22%, transparent)' }}
        >
          <div className="relative h-24 overflow-hidden sm:h-32" aria-hidden="true">
            <img
              src="/images/hero_patient_bg.jpg"
              alt=""
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover object-[center_35%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-white/20 to-white/50" />
          </div>
          <div className="relative flex flex-col gap-5 p-6 sm:p-8 lg:p-10">
            <div className="max-w-3xl space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-patients-action)' }}>
                {greeting}
              </p>
              <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl" style={{ color: 'var(--au-text-primary)' }}>
                {firstName}, {dict.patientPortal.metrics.healthInControl}
              </h2>
              <p className="text-sm leading-6 sm:text-base" style={{ color: 'var(--au-text-secondary)' }}>
                {dict.patientPortal.metrics.allReady}
              </p>
            </div>

            <span className="inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold tracking-wide" style={{ borderColor: 'color-mix(in srgb, var(--portal-patients) 24%, transparent)', backgroundColor: 'color-mix(in srgb, var(--portal-patients) 10%, white)', color: 'var(--portal-patients-action)' }}>
              <Zap aria-hidden="true" className="size-3.5" />
              {dict.patientPortal.immediateCare.tag}
            </span>

            <div className="max-w-3xl space-y-3">
              <h1 id="patient-home-immediate-title" className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl" style={{ color: "var(--au-text-primary)" }}>
                {dict.patientPortal.immediateCare.title}
              </h1>
              <p className="max-w-2xl text-sm leading-6 sm:text-base sm:leading-7" style={{ color: "var(--au-text-secondary)" }}>
                {dict.patientPortal.immediateCare.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap gap-2" aria-label={dict.patientPortal.immediateCare.title}>
              <span className="inline-flex items-center gap-2 rounded-full border bg-white/90 px-3 py-2 text-xs font-semibold shadow-sm sm:text-sm" style={{ borderColor: 'color-mix(in srgb, var(--portal-patients) 18%, transparent)', color: 'var(--portal-patients-action)' }}>
                <Stethoscope aria-hidden="true" className="size-4" style={{ color: "var(--portal-patients-action)" }} />
                {dict.patientPortal.immediateCare.chips.consultation}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border bg-white/90 px-3 py-2 text-xs font-semibold shadow-sm sm:text-sm" style={{ borderColor: 'color-mix(in srgb, var(--portal-patients) 18%, transparent)', color: 'var(--portal-patients-action)' }}>
                <FileText aria-hidden="true" className="size-4" style={{ color: "var(--portal-patients-action)" }} />
                {dict.patientPortal.immediateCare.chips.documents}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border bg-white/90 px-3 py-2 text-xs font-semibold shadow-sm sm:text-sm" style={{ borderColor: 'color-mix(in srgb, var(--portal-patients) 18%, transparent)', color: 'var(--portal-patients-action)' }}>
                <MapPin aria-hidden="true" className="size-4" style={{ color: "var(--portal-patients-action)" }} />
                {dict.patientPortal.immediateCare.chips.pharmacy}
              </span>
            </div>

            <div className="flex w-full flex-col gap-2.5">
              <a
                href="/farmacia/solicitar"
                className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-bold text-white shadow-md transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300 active:scale-[0.99]"
                style={{ backgroundColor: 'var(--portal-patients-action)' }}
              >
                {dict.patientPortal.immediateCare.cta}
                <ArrowRight aria-hidden="true" className="size-5" />
              </a>
              <p className="text-center text-xs font-medium text-neutral-500 sm:text-sm">
                {dict.patientPortal.immediateCare.hint}
              </p>
              <a
                href="/patients/appointments"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border bg-white px-5 py-3 text-sm font-semibold transition-colors hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100" style={{ borderColor: 'color-mix(in srgb, var(--portal-patients) 28%, transparent)', color: 'var(--portal-patients-action)' }}
              >
                <Calendar aria-hidden="true" className="size-4" />
                {dict.patientPortal.immediateCare.scheduledCta}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <motion.main
        className="relative bg-white"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8 space-y-12">

          {/* ── CAROUSEL MÉDICOS DISPONIBLES (COMPACT ~13%) ── */}
          <AvailableDoctorsCarousel
            doctors={carouselDoctors}
            isLoading={doctorsLoading}
            compact
            locale={locale}
          />

          {/* ── BANNER / BADGE MINHA RESERVA DE SAÚDE COM FECHAR ── */}
          <AnimatePresence mode="wait">
            {showReservaBanner && reserveData?.subscription_tier !== 'cuidado' ? (
              <motion.section
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
                transition={{ duration: 0.4 }}
                className="relative overflow-hidden rounded-3xl bg-neutral-950 text-white p-6 md:p-8 shadow-2xl border border-neutral-800"
              >
                {/* Botón de cerrar badge */}
                <button
                  type="button"
                  onClick={() => setShowReservaBanner(false)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition-colors z-20"
                  title="Fechar"
                  aria-label="Fechar"
                >
                  <X className="size-4" />
                </button>

                <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                  <div className="space-y-3 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-neutral-300 text-xs font-semibold uppercase tracking-wider">
                      <Coins className="size-3.5 text-neutral-300" />
                      AUTAMÉDICA Free
                    </div>
                    <h2 className="text-3xl md:text-4xl font-light tracking-tight text-white">
                      Assinatura AutaMedica
                    </h2>
                    <p className="text-neutral-300 text-sm md:text-base leading-relaxed">
                      Você tem acesso ao benefício de atendimento clínico. <strong className="text-white font-semibold">Precisou? Use. </strong> 
                      <strong className="text-cyan-400 font-semibold">Não precisou? Acumule (+22 créditos/mês) </strong> 
                      para especialistas, exames e farmácia.
                    </p>
                  </div>

                  {/* Saldo e Capacidade */}
                  <div className="w-full lg:w-auto min-w-[280px] bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-5 shadow-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Saldo Disponível</span>
                      <Coins className="size-5 text-cyan-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-light text-white tracking-tight">
                        {reserveData?.benefit_balance ?? 0}
                      </span>
                      <span className="text-sm font-semibold text-cyan-400">AUTA Créditos</span>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs text-neutral-400">
                        <span>Capacidade acumulada</span>
                        <span>{reserveData?.benefit_balance ?? 0} / {reserveData?.max_cap_credits ?? 600} pts</span>
                      </div>
                      <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-cyan-500 to-sky-400 rounded-full transition-all duration-500" 
                          style={{ width: `${Math.min(Math.round(((reserveData?.benefit_balance ?? 0) / (reserveData?.max_cap_credits ?? 600)) * 100), 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upsell / Ativar Plano Cuidado */}
                <div className="mt-8 pt-6 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base md:text-lg font-semibold text-white">
                        Ative o Plano Cuidado por R$ 49,90/mês
                      </h3>
                      <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Pix ou Cartão
                      </span>
                    </div>
                    <p className="text-neutral-400 text-xs md:text-sm">
                      Garanta 1 atendimento clínico mensal e acumule 22 AUTA Créditos todo mês que não precisar de consulta.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={() => setShowPixSubscriptionModal(true)}
                      className="w-full md:w-auto px-6 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold text-sm transition-all shadow-lg hover:shadow-cyan-500/25 flex items-center justify-center gap-2 shrink-0 active:scale-[0.98]"
                    >
                      <Sparkles className="size-4" />
                      Assinar com Pix (R$ 49,90)
                    </button>
                    <a
                      href="/patients/reserva-saude"
                      className="px-4 py-3 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      Ver detalhes
                      <ArrowRight className="size-3.5" />
                    </a>
                  </div>
                </div>

                {/* Sub-informações: Catálogo e Extrato */}
                <div className="mt-6 pt-6 border-t border-white/5 grid md:grid-cols-2 gap-4 text-xs text-neutral-400">
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1.5">
                    <div className="flex items-center gap-2 text-white font-medium text-sm">
                      <Stethoscope className="size-4 text-cyan-400" />
                      Catálogo de Resgate em Rede Credenciada
                    </div>
                    <p className="leading-relaxed">
                      Troque seus AUTA Créditos por consultas especializadas, check-ups laboratoriais e medicamentos.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium text-sm flex items-center gap-2">
                        <FileText className="size-4 text-cyan-400" />
                        Extrato da Reserva de Saúde
                      </span>
                      <span className="text-[10px] text-neutral-500">Todos • Acumulações • Resgates</span>
                    </div>
                    <p className="text-neutral-500 italic">
                      Nenhuma movimentação registrada na sua Reserva de Saúde até o momento.
                    </p>
                  </div>
                </div>
              </motion.section>
            ) : reserveData?.subscription_tier !== 'cuidado' ? (
              <motion.div
                key="banner-collapsed"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex justify-start"
              >
                <button
                  type="button"
                  onClick={() => setShowReservaBanner(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200/80 border border-neutral-200 text-neutral-800 text-xs font-semibold transition-all shadow-2xs group"
                >
                  <Sparkles className="size-3.5 text-cyan-600 group-hover:scale-110 transition-transform" />
                  <span>{locale === 'pt' ? 'Ver planos da AutaMédica' : 'Ver planes de AutaMédica'}</span>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

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
                  !anamnesisCompleted ? 'bg-sky-50 text-sky-700' : 'bg-cyan-50 text-cyan-700'
                }`}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                {!anamnesisCompleted ? (
                  <><AlertCircle className="size-3.5" /> {dict.patientPortal.metrics.actionRequired}</>
                ) : (
                  <><Check className="size-3.5" /> {dict.patientPortal.metrics.active}</>
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
                  ? dict.patientPortal.metrics.completeHistory
                  : dict.patientPortal.metrics.allReady}
              </motion.h2>

              <motion.p
                className="text-lg text-neutral-500 mb-10 max-w-md"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
              >
                {!anamnesisCompleted
                  ? dict.patientPortal.metrics.completeToStart
                  : 'Acesse consultas, receitas e benefícios'}
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
                {!anamnesisCompleted ? 'Completar ahora' : dict.patientPortal.metrics.bookAppointment}
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
                  <span className="text-neutral-500">{dict.patientPortal.metrics.clinicalHistory}</span>
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
                  <span className="text-neutral-500">{dict.patientPortal.metrics.completeProfile}</span>
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
                  <span className="text-neutral-500">{dict.patientPortal.metrics.freeConsultations}</span>
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
                {incompleteItems.map((item, i) => (
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
                    <div className="size-6 rounded-full border-2 border-neutral-300 group-hover:border-neutral-900 flex items-center justify-center shrink-0 transition-colors" />
                    <span className="flex-1 text-neutral-900 transition-colors">
                      {item.label}
                    </span>
                    <ArrowRight className="size-5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all" />
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
              {locale === 'pt' ? 'Como podemos te ajudar?' : '¿Cómo te ayudamos?'}
            </motion.h3>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {services.map((action, i) => (
                <motion.a
                  key={action.label}
                  href={action.href}
                  onClick={(e) => {
                    if (action.href.includes('telemedicine')) {
                      e.preventDefault()
                      window.location.href = "/patients/appointments?type=telemedicine"
                    }
                  }}
                  className="group relative flex flex-col justify-between p-7 text-left border border-slate-200/90 rounded-3xl hover:border-slate-800 bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden min-h-[220px]"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ y: -4 }}
                >
                  {/* Card Background Texture */}
                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-3xl">
                    <img
                      src={action.bgImage}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover object-right-top opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/70 to-transparent" />
                  </div>

                  <div className="relative z-10 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      {action.iconImage ? (
                        <div className="size-14 rounded-2xl overflow-hidden shadow-md border border-slate-200/80 bg-slate-950 shrink-0 group-hover:scale-105 group-hover:border-cyan-400/50 transition-all duration-300">
                          <img
                            src={action.iconImage}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover scale-125"
                          />
                        </div>
                      ) : (
                        <div className="size-14 rounded-2xl bg-slate-950 text-cyan-400 flex items-center justify-center shadow-md border border-slate-800 shrink-0 group-hover:scale-105 transition-transform duration-300">
                          <action.icon className="size-7 text-cyan-400" strokeWidth={1.8} />
                        </div>
                      )}
                      <div className="size-8 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200/60 flex items-center justify-center text-slate-400 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all shadow-xs">
                        <ArrowRight className="size-4" />
                      </div>
                    </div>

                    <div className="mt-8">
                      <p className="text-slate-950 font-bold text-lg tracking-tight">
                        {action.label}
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed mt-1 font-medium">
                        {action.desc}
                      </p>
                    </div>
                  </div>
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
          {bottomTabs.map((tab) => (
            <motion.a
              key={tab.label}
              href={tab.href}
              onClick={(e) => {
                if (tab.href.includes('telemedicine')) {
                  e.preventDefault()
                  window.location.href = "/patients/appointments?type=telemedicine"
                }
              }}
              className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-neutral-100 transition-colors min-w-[60px] cursor-pointer"
              whileTap={{ scale: 0.95 }}
            >
              <tab.icon className="size-5 text-neutral-600" />
              <span className="text-xs text-neutral-600 font-medium">{tab.label}</span>
            </motion.a>
          ))}
        </div>
      </nav>

      {/* Floating P2P Chat */}
      <PatientDoctorChat />

      {/* Topup Modal */}
      {isTopupModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={() => { if (!topupLoading) setIsTopupModalOpen(false) }}
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm transition-opacity"
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-neutral-100 bg-white p-6 shadow-2xl transition-all">
            <h3 className="text-xl font-bold tracking-tight text-neutral-900 mb-2">
              Cargar Saldo AutaMedica
            </h3>
            <p className="text-sm text-neutral-500 mb-6">
              Ingresá el monto y elegí el medio de pago en el siguiente paso.
            </p>

            <form onSubmit={handleTopup} className="space-y-4">
              <div>
                <label htmlFor="topupAmount" className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                  Monto a cargar (ARS)
                </label>
                <div className="relative rounded-2xl border border-neutral-200 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 overflow-hidden bg-stone-50/50">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 font-semibold">$</span>
                  <input
                    type="number"
                    id="topupAmount"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    placeholder="Monto"
                    min="1"
                    required
                    disabled={topupLoading}
                    className="w-full pl-8 pr-4 py-3 bg-transparent text-stone-900 placeholder-neutral-400 focus:outline-none font-semibold text-lg"
                  />
                </div>
              </div>

              {topupError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-600">
                  {topupError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTopupModalOpen(false)}
                  disabled={topupLoading}
                  className="flex-1 rounded-full border border-neutral-200 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={topupLoading}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-70 active:scale-[0.98] transition-all shadow-sm"
                >
                  {topupLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Iniciando...
                    </>
                  ) : (
                    'Cargar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      <PixCheckoutModal
        isOpen={showPixSubscriptionModal}
        onClose={() => setShowPixSubscriptionModal(false)}
        type="subscription"
        amountCents={4990}
        onSuccess={() => {
          setShowPixSubscriptionModal(false)
          fetchApi<{ success: boolean; data: HealthReserveData }>('/api/patients/reserva-saude')
            .then(res => {
              if (res?.data) setReserveData(res.data)
            })
            .catch(() => {})
        }}
      />
    </div>
  )
}
