"use client"

import { DiagnosisPanel } from '@/components/doctors/DiagnosisPanel'
import { DoctorDailySummary } from '@/components/doctors/DoctorDailySummary'
import { GracePeriodBanner } from '@/components/doctors/GracePeriodBanner'
import { OnboardingReminder } from '@/components/doctors/OnboardingReminder'
import { QuickActionsPanel } from '@/components/doctors/QuickActionsPanel'
import { VideoControlsOverlay } from '@/components/doctors/VideoControlsOverlay'
import { useDoctorsPortal } from '@/components/doctors/layout/DoctorsPortalShell'
import { PrescriptionModal } from '@/components/doctors/medical/PrescriptionModal'
import { QuickNotesModal } from '@/components/doctors/medical/QuickNotesModal'
import { TelemedicineSignalingPanel } from '@/components/doctors/telemedicine/TelemedicineSignalingPanel'
import { useActiveSession } from '@/hooks/doctors/useActiveSession'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useCheckDoctorExists } from '@/hooks/doctors/useCheckDoctorExists'
import { usePatientData } from '@/hooks/doctors/usePatientData'
import { useVideoCallControls } from '@/hooks/doctors/useVideoCallControls'
import type { Locale } from '@/i18n/index'
import { getOnboardingStatus } from '@/lib/onboarding-grace'
import { isProduction } from '@autamedica/shared'
import {
    Activity,
    Brain,
    ChevronDown,
    ChevronUp,
    FileText,
    Loader2,
    MonitorUp,
    Pill,
    ScreenShare,
    Sparkles,
    VideoOff,
    X
} from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'

type PatientNameCandidate = {
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  firstName?: string | null
  lastName?: string | null
}

type PatientAgeCandidate = {
  birthDate?: string | null
  date_of_birth?: string | null
}

export function getPatientDisplayName(patient: unknown): string {
  if (!patient || typeof patient !== 'object') {
    return 'Paciente'
  }

  const candidate = patient as PatientNameCandidate
  const fullName = candidate.full_name?.trim()
    || [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim()
    || [candidate.firstName, candidate.lastName].filter(Boolean).join(' ').trim()

  return fullName || 'Paciente'
}

function getPatientAge(patient: unknown): string {
  if (!patient || typeof patient !== 'object') {
    return '—'
  }

  const candidate = patient as PatientAgeCandidate
  const birthDateValue = candidate.birthDate ?? candidate.date_of_birth
  if (!birthDateValue) {
    return '—'
  }
  const birthDate = new Date(birthDateValue)
  const ageDifMs = Date.now() - birthDate.getTime()
  const ageDate = new Date(ageDifMs)
  return Math.abs(ageDate.getUTCFullYear() - 1970).toString()
}

interface DoctorsHomePageProps {
  locale?: Locale
}

export default function DoctorsHomePage({ locale: _locale }: DoctorsHomePageProps): JSX.Element {
  const { user, loading: authLoading } = useAuthenticatedUser()
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

  const { session } = useActiveSession()
  const { patient } = usePatientData(session?.patientId ?? null)
  const { isFocusMode, setFocusMode } = useDoctorsPortal()

  useEffect(() => {
    return () => setFocusMode(false)
  }, [setFocusMode])

  const {
    videoRef,
    screenShareRef,
    localStream,
    screenStream,
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    callStatus,
    callDuration,
    cameraError,
    handleActivateCamera,
    handleToggleAudio,
    handleToggleVideo,
    handleToggleScreenShare,
    handleEndCall,
  } = useVideoCallControls()

  const [showDiagnosisPanel, setShowDiagnosisPanel] = useState(false)
  const [showTelemedicinePanel, setShowTelemedicinePanel] = useState(false)
  const [isQuickActionsVisible, setIsQuickActionsVisible] = useState(false)
  const [showQualityOverlay, setShowQualityOverlay] = useState(false)
  const [aiProcessing] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false)
  const [isQuickActionsCollapsed, setIsQuickActionsCollapsed] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [mouseTimer, setMouseTimer] = useState<NodeJS.Timeout | null>(null)

  const hasSession = Boolean(session?.patientId)
  const signalingRoomId = useMemo(() => session?.sessionId ?? '', [session?.sessionId])
  const signalingUserId = useMemo(() => {
    if (typeof window === 'undefined' || typeof crypto === 'undefined') {
      return ''
    }
    const storageKey = 'autamedica-doctor-signaling-id'
    const cached = window.sessionStorage.getItem(storageKey)
    if (cached) {
      return cached
    }
    const generated = crypto.randomUUID()
    window.sessionStorage.setItem(storageKey, generated)
    return generated
  }, [])

  useEffect(() => {
    if (callStatus === 'live') {
      setShowQualityOverlay(true)
      setFocusMode(true)
      setIsQuickActionsCollapsed(true)
      const timer = setTimeout(() => {
        setShowQualityOverlay(false)
      }, 3000)
      return () => clearTimeout(timer)
    } else {
      setFocusMode(false)
    }
  }, [callStatus, setFocusMode])

  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true)
      if (mouseTimer) clearTimeout(mouseTimer)

      const timer = setTimeout(() => {
        if (callStatus === 'live' && isFocusMode) {
          setShowControls(false)
        }
      }, 3000)

      setMouseTimer(timer)
    }

    if (isFocusMode) {
      window.addEventListener('mousemove', handleMouseMove)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        if (mouseTimer) clearTimeout(mouseTimer)
      }
    }
  }, [isFocusMode, callStatus, mouseTimer])

  useEffect(() => {
    if (!isFocusMode) {
      setIsQuickActionsVisible(false)
      setIsQuickActionsCollapsed(false)
    }
  }, [isFocusMode])

  const formattedDuration = useMemo(() => {
    const minutes = Math.floor(callDuration / 60)
    const seconds = callDuration % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [callDuration])

  const callQuality = useMemo((): { label: string; color: string } => {
    if (cameraError) {
      return { label: 'Sin señal', color: 'text-rose-400' }
    }
    if (callStatus === 'live') {
      return { label: 'HD', color: 'text-emerald-700' }
    }
    if (callStatus === 'connecting') {
      return { label: 'Inicializando', color: 'text-amber-400' }
    }
    return { label: 'En espera', color: 'text-slate-400' }
  }, [cameraError, callStatus])

  const toggleQuickActionsVisibility = () => {
    setIsQuickActionsVisible((prev) => {
      const next = !prev
      if (next) {
        setIsQuickActionsCollapsed(false)
      }
      return next
    })
  }

  const closeQuickActions = () => {
    setIsQuickActionsVisible(false)
  }

  const toggleFocusMode = () => {
    const next = !isFocusMode
    setFocusMode(next)
    if (next) {
      setIsQuickActionsCollapsed(true)
      setIsQuickActionsVisible(false)
    }
  }

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
    <div className="flex min-h-0 flex-1 flex-col text-am-surface-900">
      {onboardingStatus.state === 'expired' && <GracePeriodBanner />}
      <div className={`call-area ${isFocusMode ? 'gap-3' : 'gap-4'} flex min-h-0 flex-1 flex-col lg:flex-row`}>
        <section className="call-area__videoCard relative flex min-h-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg">
            {cameraError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-900 to-slate-950 px-4 py-6 text-center text-slate-300 sm:px-8">
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-[0_0_30px_-5px_var(--tw-shadow-color)] shadow-rose-500/20">
                  <VideoOff className="h-10 w-10" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-100">No se detectó cámara</h3>
                <p className="max-w-md text-sm text-slate-400">{cameraError}</p>
                <button
                  type="button"
                  onClick={handleActivateCamera}
                  className="mt-2 rounded-xl border border-blue-500/30 bg-blue-600/20 px-6 py-2.5 text-sm font-semibold text-blue-300 transition-all hover:bg-blue-600 hover:text-white hover:shadow-[0_0_20px_-5px_rgba(37,99,235,0.4)] active:scale-95"
                >
                  Reintentar
                </button>
              </div>
            ) : localStream ? (
              <video
                ref={videoRef}
                className={`call-area__video h-full w-full object-cover transition-opacity ${
                  isVideoEnabled ? 'opacity-100' : 'opacity-0'
                }`}
                autoPlay
                playsInline
                muted
              />
            ) : (
              <DoctorDailySummary
                onActivateCamera={handleActivateCamera}
                isBlocked={isBlocked}
              />
            )}

            {callStatus === 'connecting' && (
              <div className="absolute inset-0 flex h-full flex-col items-center justify-center gap-4 bg-slate-950/80 text-slate-200 backdrop-blur-md z-10 transition-all duration-300">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                <p className="text-sm font-semibold tracking-wide text-blue-100">Estableciendo conexión segura…</p>
              </div>
            )}

            {isScreenSharing && (
              <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-600/20 px-4 py-1 text-xs text-blue-100">
                <ScreenShare className="h-4 w-4" />
                Compartiendo pantalla
              </div>
            )}

            {isFocusMode && patient && callStatus === 'live' && showControls && (
              <div className="video-badge z-10">
                <div className="flex items-center gap-3 rounded-lg bg-slate-900/80 px-3 py-2 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-700" />
                    <div>
                      <p className="text-xs font-semibold text-slate-100">{getPatientDisplayName(patient)}</p>
                      <p className="text-[10px] text-slate-400">{getPatientAge(patient)} años • {formattedDuration}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium ${callQuality.color}`}>
                      {callQuality.label}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {showQualityOverlay && callStatus === 'live' && !isFocusMode && (
              <div className={`absolute top-4 left-4 transition-all duration-1000 ${
                showQualityOverlay ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
              }`}>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs backdrop-blur-sm">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></div>
                  <span className="font-medium text-emerald-700">
                    {callQuality.label} • Estable
                  </span>
                </div>
              </div>
            )}

            <div className="absolute right-4 top-4 flex flex-col items-end gap-3">
              {callStatus === 'live' && (
                <button
                  type="button"
                  onClick={toggleFocusMode}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                    isFocusMode
                      ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
                      : 'border-slate-700 bg-slate-900/80 text-slate-200 hover:border-emerald-400/60 hover:text-white'
                  }`}
                >
                  {isFocusMode ? 'Salir modo foco' : 'Activar modo foco'}
                </button>
              )}

              {screenStream && (
                <div className="hidden h-32 w-48 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/70 shadow-lg sm:block">
                  <video ref={screenShareRef} className="h-full w-full object-cover" autoPlay muted playsInline />
                </div>
              )}
            </div>

            <VideoControlsOverlay
              showControls={showControls}
              isMuted={isMuted}
              isVideoEnabled={isVideoEnabled}
              isScreenSharing={isScreenSharing}
              isFocusMode={isFocusMode}
              onToggleAudio={handleToggleAudio}
              onToggleVideo={handleToggleVideo}
              onToggleScreenShare={handleToggleScreenShare}
              onEndCall={handleEndCall}
            />
          </div>

          {!isProduction() && showTelemedicinePanel && signalingRoomId && signalingUserId && (
            <TelemedicineSignalingPanel
              roomId={signalingRoomId}
              userId={signalingUserId}
              userType="doctor"
              metadata={{
                patientId: session?.patientId ?? '',
                patientName: getPatientDisplayName(patient),
              }}
              className="mt-3 rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm sm:p-6"
            />
          )}
        </section>

        {isFocusMode && (
          <button
            type="button"
            onClick={toggleQuickActionsVisibility}
            className={`call-area__quickActionsHandle hidden flex-col items-center gap-1 rounded-2xl border border-am-surface-200 bg-white px-3 py-3 text-xs font-medium text-am-surface-700 shadow-am-sm transition-all duration-am-fast hover:border-am-doctor-400 hover:text-am-surface-900 hover:shadow-am-md lg:flex ${
              isQuickActionsVisible ? 'ring-1 ring-am-doctor-400/60' : ''
            }`}
            aria-expanded={isQuickActionsVisible}
            aria-label="Herramientas rápidas de la consulta"
          >
            {isQuickActionsVisible ? (
              <>
                <X className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">Cerrar panel</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1 text-am-doctor-600">
                  <FileText className="h-3 w-3" />
                  <Pill className="h-3 w-3" />
                  <Activity className="h-3 w-3" />
                  <MonitorUp className="h-3 w-3" />
                  <Brain className="h-3 w-3" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide">Herramientas</span>
                <span className="text-[10px] font-normal text-am-surface-500">Notas · Rx · Signos · IA</span>
              </>
            )}
          </button>
        )}

        <QuickActionsPanel
          hasSession={hasSession}
          isBlocked={isBlocked}
          isFocusMode={isFocusMode}
          isQuickActionsCollapsed={isQuickActionsCollapsed}
          isQuickActionsVisible={isQuickActionsVisible}
          showTelemedicinePanel={showTelemedicinePanel}
          aiProcessing={aiProcessing}
          patientId={session?.patientId}
          onToggleCollapsed={() => setIsQuickActionsCollapsed(!isQuickActionsCollapsed)}
          onClose={closeQuickActions}
          onTakeNotes={() => setShowNotesModal(true)}
          onPrescribe={() => setShowPrescriptionModal(true)}
          onToggleTelemedicinePanel={() => setShowTelemedicinePanel(!showTelemedicinePanel)}
          onAnalyzeWithAI={() => setShowDiagnosisPanel(true)}
        />
      </div>

      {isFocusMode && (
        <div className="mt-3 flex items-center justify-center lg:hidden">
          <button
            type="button"
            onClick={() => setIsQuickActionsCollapsed(false)}
            className="flex items-center gap-2 rounded-full border border-am-surface-200 bg-white px-4 py-2.5 text-xs font-medium text-am-surface-700 shadow-am-sm transition-all duration-am-fast hover:border-am-surface-300 hover:text-am-surface-900 hover:shadow-am-md active:scale-95"
          >
            <MonitorUp className="h-4 w-4" />
            Acciones rápidas
          </button>
        </div>
      )}

      {isFocusMode && (
        <div className="fixed bottom-6 right-6 z-20 flex items-center gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setShowControls(!showControls)}
            className="rounded-full border border-am-surface-200 bg-white p-3 text-am-surface-700 shadow-am-sm transition-all duration-am-fast hover:border-am-surface-300 hover:text-am-surface-900 active:scale-95"
            aria-label="Alternar controles"
          >
            {showControls ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setIsQuickActionsCollapsed(false)}
            className="flex items-center gap-2 rounded-full bg-am-doctor-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-am-doctor-500/20 transition-all duration-am-fast hover:bg-am-doctor-500 active:scale-95"
          >
            <Sparkles className="h-4 w-4" />
            Acciones
          </button>
        </div>
      )}

      {isFocusMode && showQualityOverlay && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center lg:hidden">
          <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-700 shadow-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
            Video optimizado para modo foco
          </div>
        </div>
      )}

      {showDiagnosisPanel && (
        <DiagnosisPanel
          patientDisplayName={getPatientDisplayName(patient)}
          aiProcessing={aiProcessing}
          onClose={() => setShowDiagnosisPanel(false)}
        />
      )}

      {showNotesModal && session?.patientId && (
        <QuickNotesModal
          patientName={getPatientDisplayName(patient)}
          patientId={session.patientId}
          doctorId={user?.id}
          onClose={() => setShowNotesModal(false)}
        />
      )}

      {showPrescriptionModal && session?.patientId && (
        <PrescriptionModal
          patientName={getPatientDisplayName(patient)}
          patientId={session.patientId}
          onClose={() => setShowPrescriptionModal(false)}
        />
      )}

      {isFocusMode && isQuickActionsVisible && (
        <button
          type="button"
          className="call-area__drawerScrim fixed inset-0 z-30 hidden bg-black/20 backdrop-blur-sm lg:block"
          aria-label="Cerrar acciones rápidas"
          onClick={closeQuickActions}
        />
      )}

      {onboardingStatus.state === 'grace_period' && (
        <OnboardingReminder daysRemaining={onboardingStatus.daysRemaining} />
      )}
    </div>
  )
}
