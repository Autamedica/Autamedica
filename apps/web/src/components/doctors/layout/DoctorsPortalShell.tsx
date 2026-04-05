"use client"

import type { JSX, ReactNode } from 'react'
import { Suspense, lazy, useCallback, useMemo, useState } from 'react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PatientsPanel } from '@/components/doctors/patients/PatientsPanel'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useClock } from '@/hooks/doctors/useClock'
import { useDoctorStats } from '@/hooks/doctors/useDoctorStats'
import { useDoctorWorkspaceState, type TabId } from '@/hooks/doctors/useDoctorWorkspaceState'
import { useCurrentDoctor } from '@/hooks/doctors/useRealDoctors'
import { useSidebar } from '@/hooks/doctors/useSidebar'
import { signOutLocal } from '@/lib/auth/service'
import type { LucideIcon } from 'lucide-react'
import {
    Activity,
    BarChart3,
    Brain,
    Calendar,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    FileText,
    Home,
    LogOut,
    MapPin,
    Menu,
    MessageCircle,
    Pill,
    Settings,
    Star,
    User,
    Users,
    X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DoctorsPortalContext, type DoctorsPortalContextValue } from './portal-context'
import { SidebarNavigation } from './SidebarNavigation'

const DoctorCommunityPage = lazy(() => import('@/components/doctors/DoctorCommunityPage').then(m => ({ default: m.DoctorCommunityPage })))
const AppointmentsPanel = lazy(() => import('@/components/doctors/appointments/AppointmentsPanel').then(m => ({ default: m.AppointmentsPanel })))
const DiagnosisPanel = lazy(() => import('@/components/doctors/diagnosis/DiagnosisPanel').then(m => ({ default: m.DiagnosisPanel })))
const AIHistoryTab = lazy(() => import('@/components/doctors/medical/AIHistoryTab').then(m => ({ default: m.AIHistoryTab })))
const MedicalHistoryTab = lazy(() => import('@/components/doctors/medical/MedicalHistoryTab').then(m => ({ default: m.MedicalHistoryTab })))
const PrescriptionsTab = lazy(() => import('@/components/doctors/medical/PrescriptionsTab').then(m => ({ default: m.PrescriptionsTab })))
const VitalSignsTab = lazy(() => import('@/components/doctors/medical/VitalSignsTab').then(m => ({ default: m.VitalSignsTab })))
const PatientInfoTab = lazy(() => import('@/components/doctors/patient/PatientInfoTab').then(m => ({ default: m.PatientInfoTab })))
const MedicalRankingPanel = lazy(() => import('@/components/doctors/ranking/MedicalRankingPanel').then(m => ({ default: m.MedicalRankingPanel })))
const RecordsPanel = lazy(() => import('@/components/doctors/records/RecordsPanel').then(m => ({ default: m.RecordsPanel })))
const SettingsPanel = lazy(() => import('@/components/doctors/settings/SettingsPanel').then(m => ({ default: m.SettingsPanel })))
const VitalSignsPanel = lazy(() => import('@/components/doctors/vitals/VitalSignsPanel').then(m => ({ default: m.VitalSignsPanel })))
const MarketplacePanel = lazy(() => import('@/components/doctors/marketplace/MarketplacePanel').then(m => ({ default: m.MarketplacePanel })))

type SidebarItem = {
  id: string
  icon: LucideIcon
  label: string
  count?: number
  badge?: string
  nextAppointmentTime?: string | null
}

type TabConfig = {
  id: TabId
  label: string
  icon: LucideIcon
}

function PanelLoader(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full items-center justify-center rounded-2xl border border-am-surface-200 bg-white p-8 text-am-surface-500 shadow-am-sm"
    >
      <div className="flex items-center gap-3">
        <svg className="h-5 w-5 animate-spin text-am-doctor-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Cargando...
      </div>
    </div>
  )
}

function PanelErrorFallback(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-8">
      <div className="text-center">
        <p className="text-sm font-medium text-red-700">Error al cargar el panel</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
        >
          Recargar
        </button>
      </div>
    </div>
  )
}

type NameCandidate = {
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  firstName?: string | null
  lastName?: string | null
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'DR'
  )
}

function resolveDoctorDisplayName(...candidates: Array<NameCandidate | null | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const fullName =
      candidate.full_name?.trim()
      || [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim()
      || [candidate.firstName, candidate.lastName].filter(Boolean).join(' ').trim()

    if (fullName) {
      return fullName
    }
  }

  return 'Cuenta médica'
}

interface DoctorsPortalShellProps {
  children: ReactNode
  enableWorkspaceUrlState?: boolean
}

export function DoctorsPortalShell({
  children,
  enableWorkspaceUrlState = false,
}: DoctorsPortalShellProps): JSX.Element {
  const [isFocusMode, setIsFocusMode] = useState(false)

  const currentTime = useClock()
  const {
    isSidebarOpen,
    isSidebarCollapsed,
    activeSection,
    setIsSidebarOpen,
    setIsSidebarCollapsed,
    setActiveSection,
    handleSidebarItemClick,
  } = useSidebar(isFocusMode, setIsFocusMode)

  const { user } = useAuthenticatedUser()
  const { doctor } = useCurrentDoctor(user?.id)
  const { stats, loading: statsLoading } = useDoctorStats(doctor?.id)

  const userName = resolveDoctorDisplayName(doctor?.profile, user?.profile)
  const doctorSpecialty = doctor?.specialty || 'Especialidad pendiente'
  const doctorLicense = doctor?.license_number || 'Registro pendiente'

  const patientsCount = stats?.patientsCount ?? undefined
  const appointmentsCount = stats?.todayCount || 0
  const historyCount = stats?.historyCount ?? undefined

  const [signingOut, setSigningOut] = useState(false)
  
  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await signOutLocal()
      window.location.href = '/auth/login?portal=doctors'
    } catch {
      setSigningOut(false)
    }
  }, [])

  const {
    activeTab,
    setActiveTab,
    activePostId,
    setActivePostId,
    selectedPatientId,
    workspaceUrlStateReady,
    handleSelectPatient,
    resetWorkspace,
  } = useDoctorWorkspaceState({
    enableWorkspaceUrlState,
    activeSection,
    setActiveSection,
    setIsSidebarOpen,
    setIsSidebarCollapsed,
  })

  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      { id: 'patients', icon: Users, label: 'Pacientes', count: patientsCount },
      { id: 'appointments', icon: Calendar, label: 'Citas', count: appointmentsCount, nextAppointmentTime: stats?.nextAppointment?.time ?? null },
      { id: 'records', icon: FileText, label: 'Historiales', count: historyCount },
      { id: 'vitals', icon: Activity, label: 'Signos Vitales' },
      { id: 'diagnosis', icon: Brain, label: 'Asistente Clínico' },
      { id: 'ranking', icon: Star, label: 'Ranking' },
      { id: 'community', icon: MessageCircle, label: 'Comunidad' },
      { id: 'marketplace', icon: MapPin, label: 'Cobertura' },
      { id: 'settings', icon: Settings, label: 'Configuracion' },
    ],
    [patientsCount, appointmentsCount, historyCount, stats?.nextAppointment?.time],
  )

  const tabs = useMemo<TabConfig[]>(
    () => [
      { id: 'patient-info', label: 'Paciente', icon: User },
      { id: 'medical-history', label: 'Historial', icon: ClipboardList },
      { id: 'prescriptions', label: 'Prescripciones', icon: Pill },
      { id: 'vital-signs', label: 'Signos Vitales', icon: BarChart3 },
      { id: 'ai-history', label: 'IA', icon: Brain },
    ],
    [],
  )

  const portalContext: DoctorsPortalContextValue = {
    activeTab,
    setActiveTab,
    userName,
    isFocusMode,
    setFocusMode: setIsFocusMode,
    setActiveSection,
    activePostId,
    setActivePostId,
  }

  const hasPatientWorkspace = Boolean(selectedPatientId) && !activeSection

  const clinicalEnd = 3
  const toolsEnd = 4

  const navItems = sidebarItems.map(({ id, icon: Icon, label, count, badge }, index) => {
    const isActive = activeSection === id
    const groupLabel =
      index === 0
        ? 'Clínica'
        : index === clinicalEnd + 1
          ? 'Herramientas'
          : index === toolsEnd + 1
            ? 'Plataforma'
            : null

    return (
      <div key={id}>
        {groupLabel && (
          <p className={`px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-am-surface-500 ${index > 0 ? 'mb-2 mt-5' : 'mb-2'}`}>
            {groupLabel}
          </p>
        )}
        <button
          type="button"
          className={`au-interactive au-focus-ring relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-am-fast ease-am-ease ${
            isActive
              ? 'bg-am-doctor-50 text-am-doctor-600 ring-1 ring-am-doctor-200'
              : 'text-am-surface-700 hover:bg-am-surface-100 hover:text-am-surface-900'
          }`}
          onClick={() => handleSidebarItemClick(id)}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-am-doctor-500" />
          )}
          <span className="flex items-center gap-3">
            <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-am-doctor-600' : 'text-am-surface-500'}`} />
            <span className="font-medium">{label}</span>
          </span>
          <span className="flex items-center gap-2">
            {typeof count === 'number' && count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-am-doctor-100 px-1.5 text-[10px] font-semibold text-am-doctor-600">{count}</span>
            )}
            {badge && (
              <span className="rounded-full bg-am-doctor-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
            )}
          </span>
        </button>
      </div>
    )
  })

  const bottomNavItems: Array<{ id: string | null; icon: LucideIcon; label: string }> = [
    { id: null, icon: Home, label: 'Inicio' },
    { id: 'patients', icon: Users, label: 'Pacientes' },
    { id: 'appointments', icon: Calendar, label: 'Citas' },
    { id: 'records', icon: FileText, label: 'Historiales' },
    { id: 'settings', icon: User, label: 'Perfil' },
  ]

  if (enableWorkspaceUrlState && !workspaceUrlStateReady) {
    return (
      <DoctorsPortalContext.Provider value={portalContext}>
        <div className="flex min-h-screen items-center justify-center bg-am-surface-50 p-6">
          <div className="w-full max-w-md">
            <PanelLoader />
          </div>
        </div>
      </DoctorsPortalContext.Provider>
    )
  }

  return (
    <DoctorsPortalContext.Provider value={portalContext}>
      <div
        className={`app portal-doctor flex flex-col ${isFocusMode ? 'app--focus' : ''} bg-am-surface-50 text-am-surface-900`}
        suppressHydrationWarning
      >
        <header className="header z-10 flex items-center justify-between gap-3 border-b border-am-surface-200 bg-white px-4 shadow-am-xs sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-xl p-2 text-am-surface-500 transition-all duration-am-fast hover:bg-am-surface-100 hover:text-am-surface-900 active:scale-95 ${
                isFocusMode ? '' : 'hidden md:hidden'
              }`}
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-am-doctor-500 to-am-primary-600 shadow-lg shadow-am-doctor-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-am-surface-900">AutaMedica</p>
              <p className="text-[11px] font-medium text-am-surface-500">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-lg bg-am-surface-100 px-2.5 py-1 font-mono text-[11px] text-am-surface-500 ring-1 ring-am-surface-200">{currentTime}</span>
          </div>
        </header>

        {hasPatientWorkspace && (
          <div className="tabs border-b border-am-surface-200 bg-white">
            <div className="flex h-full w-full items-center justify-between gap-3 overflow-x-auto px-2 sm:px-4">
              <div className="flex min-w-0 flex-1 snap-x snap-mandatory gap-0.5 overflow-x-auto">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTab
                  const TabIcon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative flex min-w-36 snap-start items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all duration-am-fast md:min-w-0 ${
                        isActive
                          ? 'text-am-doctor-600'
                          : 'text-am-surface-500 hover:text-am-surface-700'
                      }`}
                    >
                      <TabIcon className={`h-3.5 w-3.5 transition-colors ${isActive ? 'text-am-doctor-600' : ''}`} />
                      <span className="whitespace-nowrap">{tab.label}</span>
                      {isActive && (
                        <motion.span
                          layoutId="tab-indicator"
                          className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-am-doctor-500"
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('patients')}
                className="hidden shrink-0 rounded-xl border border-am-surface-200 bg-white px-3 py-2 text-xs font-medium text-am-surface-600 transition-all duration-am-fast hover:border-am-doctor-300 hover:text-am-surface-900 sm:inline-flex"
              >
                Cambiar paciente
              </button>
            </div>
          </div>
        )}

        {isSidebarOpen && (
          <div
            className={`fixed inset-0 z-50 bg-black/40 ${isFocusMode ? '' : 'md:hidden'}`}
            role="dialog"
            aria-modal="true"
            onClick={() => setIsSidebarOpen(false)}
          >
            <div
              className="relative h-full w-72 max-w-[85vw] border-r border-am-surface-200 bg-white px-5 py-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    resetWorkspace()
                    setIsSidebarOpen(false)
                  }}
                  className="text-sm font-bold text-am-surface-900 transition-colors hover:text-am-doctor-600"
                >
                  Portal Médico
                </button>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="rounded-xl p-2 text-am-surface-400 transition-all duration-am-fast hover:bg-am-surface-100 hover:text-am-surface-900 active:scale-95"
                  aria-label="Cerrar menú"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="space-y-0.5 overflow-y-auto pb-16">{navItems}</nav>
              <div className="absolute inset-x-5 bottom-6 space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-am-doctor-100 bg-gradient-to-br from-am-doctor-50 to-am-primary-50 p-3">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-am-doctor-500 to-am-primary-600 text-xs font-bold text-white shadow-lg shadow-am-doctor-500/15">
                    {getInitials(userName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-am-surface-900">{userName}</p>
                    <p className="text-[10px] font-medium text-am-surface-500">Portal Médico</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-am-surface-200 bg-white px-3 py-2 text-sm font-medium text-am-surface-700 transition-all duration-am-fast hover:bg-am-surface-50 hover:text-am-surface-900 active:scale-95 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {signingOut ? 'Cerrando...' : 'Cerrar sesión'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="app__layout flex min-h-0 flex-1 overflow-hidden">
          <aside
            className={`left-rail relative hidden flex-col border-r border-am-surface-200 bg-white px-2 py-4 transition-all duration-am-slow ease-am-ease md:flex ${
              !isSidebarCollapsed ? 'left-rail--expanded w-56' : 'w-12'
            }`}
          >
            <div className="mb-5 flex items-center justify-between px-1">
              {!isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => {
                    resetWorkspace()
                  }}
                  className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-am-surface-500 transition-colors hover:text-am-doctor-600"
                >
                  Menú
                </button>
              )}
              {isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => {
                    resetWorkspace()
                  }}
                  className="rounded-lg p-2 text-am-surface-400 transition-colors hover:bg-am-surface-100 hover:text-am-doctor-600"
                  title="Portal Médico"
                >
                  <Home className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="rounded-lg p-1.5 text-am-surface-400 transition-colors hover:bg-am-surface-100 hover:text-am-surface-700"
                aria-label={isSidebarCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
              >
                {isSidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </button>
            </div>
            <SidebarNavigation
              items={sidebarItems}
              activeSection={activeSection}
              isSidebarCollapsed={isSidebarCollapsed}
              clinicalEnd={clinicalEnd}
              toolsEnd={toolsEnd}
              onItemClick={handleSidebarItemClick}
            />
            <div className={`mt-auto space-y-2 ${isSidebarCollapsed ? '' : ''}`}>
              <div className={`rounded-xl border border-am-doctor-100 bg-gradient-to-br from-am-doctor-50 to-am-primary-50 p-2.5 ${isSidebarCollapsed ? 'px-2' : ''}`}>
                <div className={`flex items-center gap-2.5 ${isSidebarCollapsed ? 'flex-col text-center' : ''}`}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-am-doctor-500 to-am-primary-600 text-[10px] font-bold text-white shadow-md shadow-am-doctor-500/15">
                    {getInitials(userName)}
                  </div>
                  {!isSidebarCollapsed && (
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-am-surface-900">{userName}</p>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border border-am-surface-200 bg-white text-xs font-medium text-am-surface-600 transition-all duration-am-fast hover:bg-am-surface-50 hover:text-am-surface-900 active:scale-95 disabled:opacity-50 ${
                  isSidebarCollapsed ? 'p-2' : 'px-2.5 py-2'
                }`}
                title="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
                {!isSidebarCollapsed && (signingOut ? 'Cerrando...' : 'Cerrar sesión')}
              </button>
            </div>
          </aside>

          <main className="flex min-h-0 flex-1 flex-col bg-am-surface-50">
            <section
              className={`flex min-h-0 flex-1 overflow-hidden p-0`}
            >
              <div
                className="flex h-full w-full flex-col overflow-auto p-4 pb-20 md:p-6 md:pb-6"
                role="main"
                aria-label="Panel de contenido médico principal"
              >
                <AnimatePresence mode="wait">
                <motion.div
                  key={activeSection || (hasPatientWorkspace ? activeTab : 'dashboard')}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                {activeSection === 'settings' && (
                  <ErrorBoundary fallback={<PanelErrorFallback />}>
                    <Suspense fallback={<PanelLoader />}>
                      <SettingsPanel
                        doctorName={userName}
                        specialty={doctorSpecialty}
                        licenseNumber={String(doctorLicense)}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeSection === 'marketplace' && (
                  <ErrorBoundary fallback={<PanelErrorFallback />}>
                    <Suspense fallback={<PanelLoader />}>
                      <MarketplacePanel />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeSection === 'patients' && user?.id && <PatientsPanel doctorUserId={user.id} onSelectPatient={handleSelectPatient} />}
                {activeSection === 'appointments' && (
                  <ErrorBoundary fallback={<PanelErrorFallback />}>
                    <Suspense fallback={<PanelLoader />}>
                      <AppointmentsPanel doctorId={doctor?.id} />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeSection === 'records' && (
                  <ErrorBoundary fallback={<PanelErrorFallback />}>
                    <Suspense fallback={<PanelLoader />}>
                      <RecordsPanel onNavigateToPatients={() => setActiveSection('patients')} />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeSection === 'vitals' && (
                  <ErrorBoundary fallback={<PanelErrorFallback />}>
                    <Suspense fallback={<PanelLoader />}>
                      <VitalSignsPanel onNavigateToPatients={() => setActiveSection('patients')} />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeSection === 'diagnosis' && (
                  <ErrorBoundary fallback={<PanelErrorFallback />}>
                    <Suspense fallback={<PanelLoader />}>
                      <DiagnosisPanel />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeSection === 'ranking' && (
                  <ErrorBoundary fallback={<PanelErrorFallback />}>
                    <Suspense fallback={<PanelLoader />}>
                      <MedicalRankingPanel />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeSection === 'community' && (
                  <ErrorBoundary fallback={<PanelErrorFallback />}>
                    <Suspense fallback={<PanelLoader />}>
                      <DoctorCommunityPage initialPostId={activePostId} />
                    </Suspense>
                  </ErrorBoundary>
                )}

                {!activeSection && (
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    {hasPatientWorkspace ? (
                      <Suspense fallback={<PanelLoader />}>
                        <div className="flex min-h-0 w-full flex-1 overflow-y-auto rounded-2xl border border-am-surface-200 bg-white p-6 shadow-am-sm">
                          {activeTab === 'patient-info' && <PatientInfoTab patientId={selectedPatientId} />}
                          {activeTab === 'medical-history' && <MedicalHistoryTab patientId={selectedPatientId} />}
                          {activeTab === 'prescriptions' && <PrescriptionsTab patientId={selectedPatientId} />}
                          {activeTab === 'vital-signs' && <VitalSignsTab patientId={selectedPatientId} />}
                          {activeTab === 'ai-history' && <AIHistoryTab patientId={selectedPatientId} />}
                        </div>
                      </Suspense>
                    ) : (
                      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
                        {children}
                      </div>
                    )}
                  </div>
                )}
                </motion.div>
                </AnimatePresence>
              </div>
            </section>
            <footer className="hidden items-center justify-between border-t border-am-surface-200 bg-white px-4 py-2 text-[11px] sm:px-6 md:flex">
              <div className="flex items-center gap-3 text-am-surface-400">
                <span className="font-semibold text-am-surface-600">AutaMedica</span>
                {!statsLoading && stats?.activeCount ? (
                  <>
                    <span className="h-3 w-px bg-am-surface-300" />
                    <span className="flex items-center gap-1.5 text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {stats.activeCount} consulta{stats.activeCount !== 1 ? 's' : ''} activa{stats.activeCount !== 1 ? 's' : ''}
                    </span>
                  </>
                ) : null}
                {stats?.nextAppointment && (
                  <>
                    <span className="hidden h-3 w-px bg-am-surface-300 sm:block" />
                    <span className="hidden sm:inline">
                      Próxima: {stats.nextAppointment.time}
                    </span>
                  </>
                )}
              </div>
              <span className="text-am-surface-400">v1.0</span>
            </footer>
          </main>
        </div>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-am-surface-100/80 bg-white/95 backdrop-blur-xl md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Navegación principal"
        >
          <div className="flex items-end justify-around px-2">
            {bottomNavItems.map(({ id, icon: Icon, label }) => {
              const isHome = id === null
              const isPatientWorkspaceActive = Boolean(selectedPatientId) && !activeSection
              const isActive = isHome
                ? !activeSection && !isPatientWorkspaceActive
                : id === 'records'
                  ? activeSection === id || isPatientWorkspaceActive
                  : activeSection === id

              return (
                <button
                  key={id ?? 'home'}
                  type="button"
                  onClick={() => {
                    if (isHome) {
                      resetWorkspace()
                    } else if (id !== null) {
                      handleSidebarItemClick(id)
                    }
                  }}
                  className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-all duration-200 active:scale-90"
                >
                  {isActive && (
                    <motion.span
                      layoutId="bottomnav-indicator"
                      className="absolute top-0 h-[3px] w-8 rounded-b-full bg-am-doctor-500"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon
                    className={`h-5 w-5 transition-all duration-200 ${
                      isActive ? 'text-am-doctor-600 stroke-[2.5]' : 'text-am-surface-400 stroke-[1.5]'
                    }`}
                  />
                  <span className={`text-[10px] leading-none transition-colors duration-200 ${
                    isActive ? 'text-am-doctor-600 font-semibold' : 'text-am-surface-400 font-medium'
                  }`}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </DoctorsPortalContext.Provider>
  )
}
