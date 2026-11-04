'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { UnifiedVideoCall, CallAuxiliaryButton, createCallProvider, createCallService, useAudioTranscription, useTurnCredentials } from '@autamedica/telemedicine'
import { FileText, Pill } from 'lucide-react'
import type { TranscriptSegment } from '@autamedica/telemedicine'
import type { CallStatus } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { fetchApi } from '@/lib/api-client'
import { useCallSession } from '@/hooks/calls/useCallSession'
import { useConsultationContext } from '@/hooks/doctors/useConsultationContext'
import { useDoctorWaitingRoom, formatWaitingCountdown, getWaitingCopy } from '@/hooks/doctors/useDoctorWaitingRoom'
import { translateCallError } from '@/lib/calls/lib/call-error-messages'
import { GuestLinkButton } from '@/components/doctors/calls/GuestLinkButton'
import { persistCallStatusBrowserService } from '@/lib/calls/services/persist-call-status.browser'
import {
  clearConsultationNotesDraft,
  readConsultationNotesDraft,
  writeConsultationNotesDraft,
} from '@/lib/doctors/calls/consultation-notes-draft'
import { ConsultationContextPanel } from './ConsultationContextPanel'
import { PrescriptionCreateModal } from '@/components/doctors/medical/PrescriptionCreateModal'
import { prescriptionService } from '@/lib/doctors/services/prescription.service'
import { MedicalOrderCreateModal } from '@/components/doctors/medical/MedicalOrderCreateModal'
import { medicalOrderService } from '@/lib/doctors/services/medical-order.service'
import type { UUID, Prescription, MedicalOrder } from '@/types/medical'

interface DoctorCallPageProps {
  roomId: string
}

type NotesSaveState = 'idle' | 'saving' | 'saved' | 'error'

const NOTES_AUTOSAVE_DELAY_MS = 900
const CAPTION_HIDE_DELAY_MS = 3200
const MAX_SUBTITLE_CHARS = 180

function formatTranscriptForUi(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es-AR')
}

function appendTranscriptChunk(current: string, chunk: string): string {
  const nextChunk = chunk.trim()
  if (!nextChunk) return current
  if (!current.trim()) return nextChunk
  return `${current}${/[\s\n]$/.test(current) ? '' : ' '}${nextChunk}`
}

function toSubtitleText(value: string): string {
  const normalized = formatTranscriptForUi(value)
  if (normalized.length <= MAX_SUBTITLE_CHARS) return normalized
  return `…${normalized.slice(-MAX_SUBTITLE_CHARS)}`
}

export default function DoctorCallPage({ roomId }: DoctorCallPageProps) {
  return (
    <AuthProvider onAuthStateChange={() => {}}>
      <DoctorCallContent roomId={roomId} />
    </AuthProvider>
  )
}

function DoctorCallContent({ roomId }: { roomId: string }) {
  const { session, profile, loading } = useAuth()
  const [isReady, setIsReady] = useState(false)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [doctorNotes, setDoctorNotes] = useState('')
  const [notesSaveState, setNotesSaveState] = useState<NotesSaveState>('idle')
  const [voiceNotesEnabled, setVoiceNotesEnabled] = useState(false)
  const [liveMicLevel, setLiveMicLevel] = useState(0)
  const [captionText, setCaptionText] = useState('')
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false)
  const [showStudyOrderModal, setShowStudyOrderModal] = useState(false)
  const { context, loading: contextLoading, error: contextError } = useConsultationContext(roomId)
  const {
    session: callSession,
    loading: callSessionLoading,
    error: callSessionError,
    refresh: refreshCallSession,
  } = useCallSession(roomId, isReady)

  // Client-side TURN fallback — if bootstrap didn't include TURN, fetch from API
  const { iceServers: clientTurnServers, loading: turnLoading } = useTurnCredentials('/api/doctors/turn-credentials')

  // Transcription — mandatory, automatic, silent
  const [transcriptionState, transcriptionActions] = useAudioTranscription('es-AR')
  const callStartTimeRef = useRef<number | null>(null)
  const transcriptionSavedRef = useRef(false)
  const transcriptionStartedRef = useRef(false)
  const callServiceRef = useRef<ReturnType<typeof createCallService> | null>(null)
  const notesHydratedRef = useRef(false)
  const voiceNotesCursorRef = useRef(0)
  const latestCaptionTimestampRef = useRef(0)
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getCallService = useCallback(() => {
    if (!callServiceRef.current) {
      callServiceRef.current = createCallService(getBrowserSupabaseClient())
    }
    return callServiceRef.current
  }, [])

  // Waiting room state machine (extracted hook)
  const {
    state: doctorWaitingState,
    secondsRemaining: waitSecondsRemaining,
    error: waitingActionError,
    showWaitingRoom: showDoctorWaitingRoom,
    cancelCall: cancelWaitingCall,
  } = useDoctorWaitingRoom({ callSession, getCallService, refreshCallSession })

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  useEffect(() => {
    notesHydratedRef.current = false
    const draft = readConsultationNotesDraft(roomId)
    setDoctorNotes(draft?.notes ?? '')
    setNotesSaveState(draft?.notes ? 'saved' : 'idle')

    setVoiceNotesEnabled(false)
    voiceNotesCursorRef.current = 0
    notesHydratedRef.current = true
  }, [roomId])

  useEffect(() => {
    if (!notesHydratedRef.current) return

    if (!doctorNotes.trim()) {
      clearConsultationNotesDraft(roomId)
      setNotesSaveState('saved')
      return
    }

    setNotesSaveState('saving')
    const timeoutId = window.setTimeout(() => {
      try {
        const updatedAt = new Date().toISOString()
        writeConsultationNotesDraft(roomId, {
          notes: doctorNotes,
          updatedAt,
        })
        setNotesSaveState('saved')
      } catch {
        setNotesSaveState('error')
      }
    }, NOTES_AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [doctorNotes, roomId])

  useEffect(() => {
    if (!voiceNotesEnabled) return

    const freshSegments = transcriptionState.segments.filter(
      (segment) => segment.isFinal && segment.timestamp > voiceNotesCursorRef.current,
    )

    if (freshSegments.length === 0) return

    const nextChunk = freshSegments
      .map((segment) => formatTranscriptForUi(segment.text))
      .filter(Boolean)
      .join(' ')

    voiceNotesCursorRef.current = freshSegments[freshSegments.length - 1]?.timestamp ?? voiceNotesCursorRef.current

    if (!nextChunk) return

    setDoctorNotes((current) => appendTranscriptChunk(current, nextChunk))
  }, [transcriptionState.segments, voiceNotesEnabled])

  useEffect(() => {
    if (showDoctorWaitingRoom) {
      if (captionTimeoutRef.current) {
        clearTimeout(captionTimeoutRef.current)
        captionTimeoutRef.current = null
      }
      setCaptionText('')
      return
    }

    if (transcriptionState.interimText.trim()) {
      if (captionTimeoutRef.current) {
        clearTimeout(captionTimeoutRef.current)
        captionTimeoutRef.current = null
      }
      setCaptionText(toSubtitleText(transcriptionState.interimText))
      return
    }

    const latestFinalSegment = transcriptionState.segments[transcriptionState.segments.length - 1]
    if (!latestFinalSegment || latestFinalSegment.timestamp <= latestCaptionTimestampRef.current) {
      return
    }

    latestCaptionTimestampRef.current = latestFinalSegment.timestamp
    setCaptionText(toSubtitleText(latestFinalSegment.text))
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current)
    captionTimeoutRef.current = setTimeout(() => {
      setCaptionText('')
      captionTimeoutRef.current = null
    }, CAPTION_HIDE_DELAY_MS)
  }, [showDoctorWaitingRoom, transcriptionState.interimText, transcriptionState.segments])

  useEffect(() => {
    return () => {
      if (captionTimeoutRef.current) {
        clearTimeout(captionTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (showDoctorWaitingRoom) {
      setVoiceNotesEnabled(false)
    }
  }, [showDoctorWaitingRoom])

  const typedProfile = profile as (UserProfile & { role?: string; email?: string }) | null
  const callSessionId = callSession?.callId?.trim() ?? ''
  const renderableCallSession =
    Boolean(callSession)
    && callSessionId.length > 0
    && (callSession?.roomId?.trim().length ?? 0) > 0
    && (callSession?.user.id?.trim().length ?? 0) > 0
    && (callSession?.user.role?.trim().length ?? 0) > 0

  useEffect(() => {
    if (loading) return

    if (!session) {
      const authOrigin = window.location.origin
      const loginUrl = new URL('/auth/login', authOrigin)
      loginUrl.searchParams.set('portal', 'doctors')
      loginUrl.searchParams.set('returnTo', `${window.location.origin}/doctors/call/${roomId}`)
      window.location.href = loginUrl.toString()
      return
    }

    if (typedProfile?.role !== 'doctor') {
      window.location.href = '/'
      return
    }

    setIsReady(true)
  }, [session, loading, roomId, typedProfile])

  // Waiting room effects are fully managed by useDoctorWaitingRoom hook.

  const saveTranscription = useCallback(async (segments: TranscriptSegment[]) => {
    if (transcriptionSavedRef.current || segments.length === 0) return
    transcriptionSavedRef.current = true

    const finalSegments = segments.filter(s => s.isFinal)
    if (finalSegments.length === 0) return

    const fullText = finalSegments.map(s => s.text).join(' ')
    const durationSeconds = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : undefined

    const transcriptionBody = {
      segments: finalSegments,
      fullText,
      durationSeconds,
      consentDoctor: true,
      lang: 'es-AR',
    }

    const url = `/api/doctors/consultations/${roomId}/transcription`
    const RETRY_DELAYS = [0, 1_000, 2_000]

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (RETRY_DELAYS[attempt] > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
      }
      try {
        await fetchApi(url, { body: transcriptionBody })
        return
      } catch (err) {
        logger.error(`[DoctorCallPage] Transcription save failed, attempt ${attempt + 1}`, err)
      }
    }

    // Last resort: sendBeacon survives page unload
    if (typeof navigator.sendBeacon === 'function') {
      const beaconPayload = JSON.stringify(transcriptionBody)
      const sent = navigator.sendBeacon(url, new Blob([beaconPayload], { type: 'application/json' }))
      if (!sent) {
        logger.error('[DoctorCallPage] sendBeacon also failed for transcription')
      }
    }
  }, [roomId])

  const handleCallEnd = useCallback(async () => {
    setVoiceNotesEnabled(false)
    if (transcriptionState.isTranscribing) {
      transcriptionActions.stop()
    }
    await saveTranscription(transcriptionState.segments)
    window.location.href = `/doctors/call/${roomId}/report`
  }, [roomId, transcriptionState.segments, transcriptionState.isTranscribing, transcriptionActions, saveTranscription])

  const handleAcceptCall = useCallback(async () => {
    if (!callSession?.callId) return
    try {
      await fetchApi(`/api/doctors/calls/${callSession.callId}/accept`, { method: 'POST' })
      logger.info("[DoctorCallPage] Call accepted and session clinical activated")
    } catch (err) {
      logger.error("[DoctorCallPage] Failed to accept call", err)
    }
  }, [callSession?.callId])

  const handleCallStart = useCallback(() => {
    void handleAcceptCall()
    callStartTimeRef.current = Date.now()
    // Auto-start transcription silently when call begins
    if (transcriptionState.isSupported && !transcriptionStartedRef.current) {
      transcriptionStartedRef.current = true
      transcriptionActions.start()
    }
    // Notify doctor that patient connected
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Paciente conectado', {
          body: 'El paciente se ha unido a la consulta',
          icon: '/icons/logo-192.png',
          tag: 'patient-connected',
        })
      } catch { /* ignore */ }
    }
  }, [handleAcceptCall, transcriptionState.isSupported, transcriptionActions])

  const handleNotesChange = useCallback((nextValue: string) => {
    setDoctorNotes(nextValue.slice(0, 10_000))
  }, [])

  const handleToggleVoiceNotes = useCallback(() => {
    if (showDoctorWaitingRoom || !transcriptionState.isSupported) {
      return
    }

    if (!transcriptionState.isTranscribing) {
      transcriptionStartedRef.current = true
      transcriptionActions.start()
    }

    setVoiceNotesEnabled((current) => {
      if (!current) {
        voiceNotesCursorRef.current = transcriptionState.segments[transcriptionState.segments.length - 1]?.timestamp ?? 0
      }
      return !current
    })
  }, [
    showDoctorWaitingRoom,
    transcriptionActions,
    transcriptionState.isSupported,
    transcriptionState.isTranscribing,
    transcriptionState.segments,
  ])

  const handleAudioLevelChange = useCallback((level: number) => {
    setLiveMicLevel(level)
  }, [])

  const liveTranscriptPreview = useMemo(() => {
    if (!voiceNotesEnabled || !transcriptionState.interimText.trim()) {
      return null
    }

    return toSubtitleText(transcriptionState.interimText)
  }, [transcriptionState.interimText, voiceNotesEnabled])

  const handlePersistCallStatus = useCallback(
    async (status: CallStatus, reason?: string) => {
      if (!callSession) {
        return
      }

      // Evitamos persistir estados de conexión mientras el médico está esperando a que el paciente acepte
      // para evitar conflictos 409 con la máquina de estados estricta de la base de datos
      if ((doctorWaitingState as string) === 'waiting' && (status === 'connecting' || status === 'connected')) {
        return
      }

      if (status !== 'connecting' && status !== 'connected' && status !== 'ended') {
        return
      }

      try {
        await persistCallStatusBrowserService.persist(callSession.callId, {
          status,
          ...(reason ? { reason } : {}),
        })
      } catch (err) {
        logger.warn('[DoctorCallPage] Failed to persist call status', { status, error: err })
      }
    },
    [callSession, doctorWaitingState]
  )

  const { userId, userName } = useMemo(() => {
    if (session && typedProfile) {
      return {
        userId: session?.user?.id ?? '',
        userName: typedProfile.firstName && typedProfile.lastName
          ? `${typedProfile.firstName} ${typedProfile.lastName}`
          : 'Doctor'
      }
    }

    return {
      userId: '',
      userName: 'Doctor'
    }
  }, [session, typedProfile, roomId])

  // Stabilize provider: only recreate if callId or runtime changes
  // IMPORTANT: Wait for turnLoading to be false to avoid destroying connection immediately after start
  const callProvider = useMemo(
    () => {
      if (!callSession || turnLoading) return null;
      return createCallProvider({
        bootstrap: callSession,
        supabase: getBrowserSupabaseClient(),
        iceServersOverride: clientTurnServers ?? undefined,
      });
    },
    [callSession?.callId, callSession?.runtime, turnLoading, clientTurnServers],
  )

  if (callSessionError) {
    const errorInfo = translateCallError(callSessionError)
    return (
      <div className="flex min-h-screen items-center justify-center bg-am-surface-900 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-am-surface-900 p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-am-doctor-400">
            Telemedicina profesional
          </p>
          <div className="mx-auto mb-4 mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg className="h-7 w-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-am-surface-50">{errorInfo.title}</h1>
          <p className="mt-3 text-sm text-slate-500">{errorInfo.description}</p>
          {errorInfo.retryHint && (
            <p className="mt-2 text-sm text-amber-600">{errorInfo.retryHint}</p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void refreshCallSession()}
              className="rounded-2xl bg-am-doctor-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-am-doctor-700"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/doctors' }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-am-surface-900"
            >
              Volver al portal
            </button>
          </div>
        </div>
      </div>
    )
  }

  if ((loading || !isReady) || (!callSession && callSessionLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-am-surface-900 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-am-surface-900 p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-am-doctor-400">
            Telemedicina profesional
          </p>
          <div className="mx-auto mb-4 mt-5 h-12 w-12 animate-spin rounded-full border-b-2 border-am-doctor-400"></div>
          <h1 className="text-xl font-semibold text-am-surface-50">Preparando videollamada...</h1>
          <p className="mt-3 text-sm text-slate-500">
            Estamos validando la sala, el contexto clínico y la conexión segura antes de ingresar.
          </p>
        </div>
      </div>
    )
  }

  if (!renderableCallSession) {
    return (
      <div className="min-h-screen bg-am-surface-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-am-surface-900 p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-am-doctor-400">
            Telemedicina profesional
          </p>
          <div className="mx-auto mb-4 mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <svg className="h-7 w-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-am-surface-50">La videollamada quedó inconsistente</h1>
          <p className="mt-3 text-sm text-slate-500">
            Recibimos una sesión parcial. Reintentá para reconstruir la llamada antes de volver a entrar.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void refreshCallSession()}
              className="rounded-2xl bg-am-doctor-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-am-doctor-700"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/doctors' }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-am-surface-900"
            >
              Volver al portal
            </button>
          </div>
        </div>
      </div>
    )
  }

  const waitingCopy = getWaitingCopy(doctorWaitingState, callSession.waitingRoom.message, callSession.peer?.displayName)
  const showWaitingRoomOverlay = showDoctorWaitingRoom && doctorWaitingState !== 'waiting'

  return (
    <div className="h-screen bg-am-surface-900 overflow-hidden flex">
      {/* Video Call */}
      <div className={`flex-1 min-w-0 transition-all duration-300 relative ${panelCollapsed ? '' : 'mr-0'}`}>
        {showWaitingRoomOverlay ? (
          <div className="h-screen flex items-center justify-center px-6">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-am-surface-900 p-8 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${
                    (doctorWaitingState as string) === 'waiting' ? 'text-am-doctor-400' : 'text-slate-500/80'
                  }`}>
                    {(doctorWaitingState as string) === 'waiting' ? 'Videollamada lista' : 'Videollamada finalizada'}
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold text-am-surface-50">
                    {waitingCopy.title}
                  </h1>
                </div>
                <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  (doctorWaitingState as string) === 'waiting'
                    ? 'border-am-doctor-200 bg-am-doctor-50 text-am-doctor-700'
                    : doctorWaitingState === 'canceling'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-am-surface-900 text-slate-700'
                }`}>
                  {(doctorWaitingState as string) === 'waiting'
                    ? formatWaitingCountdown(waitSecondsRemaining)
                    : doctorWaitingState === 'canceling'
                      ? 'Procesando'
                      : 'Cerrada'}
                </div>
              </div>

              <p className="mt-4 text-base leading-7 text-am-surface-300">
                {waitingCopy.description}
              </p>

              <div className="mt-8 rounded-2xl border border-slate-100 bg-am-surface-900 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-am-surface-50">Estado de invitacion</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {(doctorWaitingState as string) === 'waiting'
                        ? 'El paciente verá la llamada entrante y podrá aceptar desde su portal.'
                        : 'La invitación ya no está activa para esta sala.'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Call ID</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{callSession.callId.slice(-8)}</p>
                  </div>
                </div>
              </div>

              {waitingActionError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {waitingActionError}
                </div>
              )}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {(doctorWaitingState as string) === 'waiting' || doctorWaitingState === 'canceling' ? (
                  <button
                    type="button"
                    onClick={() => void cancelWaitingCall('doctor_canceled')}
                    disabled={doctorWaitingState === 'canceling'}
                    className="inline-flex items-center justify-center rounded-2xl bg-am-surface-900 border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {doctorWaitingState === 'canceling' ? 'Cancelando...' : 'Cancelar llamada'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/doctors' }}
                    className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                  >
                    Volver al portal
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { window.location.href = '/doctors' }}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-am-surface-900 transition-colors"
                >
                  Ir al inicio medico
                </button>
              </div>

              {(doctorWaitingState as string) === 'waiting' && (
                <GuestLinkButton callId={callSession.callId} />
              )}
            </div>
          </div>
        ) : callProvider && (
          <UnifiedVideoCall
            provider={callProvider}
            roomId={callSession.roomId}
            callId={callSession.callId}
            userId={callSession.user.id || userId}
            userType={callSession.user.role}
            userName={callSession.user.displayName || userName}
            iceServers={clientTurnServers ?? callSession.transport.iceServers}
            theme="doctor"
            onCallEnd={handleCallEnd}
            onCallStart={handleCallStart}
            persistCallStatus={handlePersistCallStatus}
            callService={getCallService()}
            autoStart
            runtime={callSession.runtime}
            className="h-screen"
            onLocalAudioLevelChange={handleAudioLevelChange}
            auxiliaryControls={
              context?.patient?.id && !context.dispatchTriage &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.patient.id) ? (
                <>
                  <CallAuxiliaryButton
                    icon={<Pill className="h-5 w-5 md:h-5.5 md:w-5.5" />}
                    label="Receta"
                    onClick={() => setShowPrescriptionModal(true)}
                  />
                  <CallAuxiliaryButton
                    icon={<FileText className="h-5 w-5 md:h-5.5 md:w-5.5" />}
                    label="Estudio"
                    onClick={() => setShowStudyOrderModal(true)}
                  />
                </>
              ) : null
            }
          />
        )}

        {/* Transcription active indicator — minimal, non-intrusive */}
        {!showDoctorWaitingRoom && transcriptionState.isTranscribing && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-am-surface-900 border border-red-100 rounded-full px-3 py-1.5 shadow-sm" title="Transcripción activa">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold text-red-600 select-none">REC</span>
          </div>
        )}

        {!showDoctorWaitingRoom && captionText && (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center px-4 sm:bottom-32">
            <div className="max-w-2xl rounded-2xl border border-am-surface-700/50 bg-slate-950/66 px-4 py-2.5 text-center shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                subtítulo local
              </p>
              <p className="mt-1 text-sm font-medium leading-6 text-white/88 lowercase sm:text-[15px]">
                {captionText}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Clinical Context Panel */}
      <div className={`shrink-0 transition-all duration-300 ${panelCollapsed ? 'w-0' : 'w-96'} bg-am-surface-900 border-l border-slate-200`}>
        <ConsultationContextPanel
          context={context}
          loading={contextLoading}
          error={contextError}
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed(prev => !prev)}
          liveNotes={doctorNotes}
          onLiveNotesChange={handleNotesChange}
          notesSaveState={notesSaveState}
          micLevel={liveMicLevel}
          voiceNotesEnabled={voiceNotesEnabled}
          voiceNotesAvailable={!showDoctorWaitingRoom && transcriptionState.isSupported}
          liveTranscriptPreview={liveTranscriptPreview}
          onToggleVoiceNotes={handleToggleVoiceNotes}
        />
      </div>

      {showPrescriptionModal && context?.patient?.id && !context.dispatchTriage &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.patient.id) && (
        <PrescriptionCreateModal
          patientId={context.patient.id as UUID}
          onClose={() => setShowPrescriptionModal(false)}
          onSaved={() => {
            setShowPrescriptionModal(false)
          }}
          addPrescription={(p) => {
            const pid = context?.patient?.id;
            if (!pid) throw new Error('Patient ID missing');
            return prescriptionService.create(pid, {
              ...p,
              patient_id: pid as UUID,
            });
          }}
          issuePrescription={async (id) => {
            await prescriptionService.issue(id)
          }}
          updatePrescription={async (id, updates) => {
            await prescriptionService.update(id, {} as Prescription, updates)
          }}
          submitLabel="Emitir receta"
        />
      )}

      {showStudyOrderModal && context?.patient?.id && !context.dispatchTriage &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.patient.id) && (
        <MedicalOrderCreateModal
          patientId={context.patient.id as UUID}
          onClose={() => setShowStudyOrderModal(false)}
          onSaved={() => {
            setShowStudyOrderModal(false)
          }}
          addMedicalOrder={(o) => {
            const pid = context?.patient?.id;
            if (!pid) throw new Error('Patient ID missing');
            return medicalOrderService.create(pid, {
              ...o,
              patient_id: pid as UUID,
            });
          }}
          issueMedicalOrder={async (id) => {
            await medicalOrderService.issue(id)
          }}
          updateMedicalOrder={async (id, updates) => {
            await medicalOrderService.update(id, {} as MedicalOrder, updates)
          }}
          submitLabel="Solicitar estudio"
        />
      )}
    </div>
  )
}
