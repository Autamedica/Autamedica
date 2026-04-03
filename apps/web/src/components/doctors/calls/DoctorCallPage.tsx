'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserClient } from '@autamedica/auth'
import { UnifiedVideoCall, createCallService, useAudioTranscription, useTurnCredentials } from '@autamedica/telemedicine'
import type { TranscriptSegment } from '@autamedica/telemedicine'
import type { CallStatus } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import { useCallSession } from '@/hooks/calls/useCallSession'
import { useConsultationContext } from '@/hooks/doctors/useConsultationContext'
import { translateCallError } from '@/lib/calls/lib/call-error-messages'
import { cancelCallBrowserService } from '@/lib/calls/services/cancel-call.browser'
import { persistCallStatusBrowserService } from '@/lib/calls/services/persist-call-status.browser'
import { ConsultationContextPanel } from './ConsultationContextPanel'

interface DoctorCallPageProps {
  roomId: string
}

type DoctorWaitingState =
  | 'idle'
  | 'waiting'
  | 'canceling'
  | 'canceled'
  | 'timed_out'
  | 'declined'
  | 'ended'

const DOCTOR_NO_ANSWER_TIMEOUT_SECONDS = 60

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function getWaitingSecondsRemaining(deadlineAt?: string): number {
  if (!deadlineAt) {
    return DOCTOR_NO_ANSWER_TIMEOUT_SECONDS
  }

  const deadlineMs = Date.parse(deadlineAt)

  if (Number.isNaN(deadlineMs)) {
    return DOCTOR_NO_ANSWER_TIMEOUT_SECONDS
  }

  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
}

function getWaitingCopy(
  state: DoctorWaitingState,
  defaultMessage?: string,
): { title: string; description: string } {
  switch (state) {
    case 'canceling':
      return {
        title: 'Cancelando videollamada...',
        description: 'Estamos cerrando la invitacion para que el paciente ya no vea esta llamada.',
      }
    case 'canceled':
      return {
        title: 'Videollamada cancelada',
        description: 'La invitacion se cerro antes de que el paciente se conectara.',
      }
    case 'timed_out':
      return {
        title: 'Sin respuesta del paciente',
        description: 'La videollamada se cancelo automaticamente porque nadie respondio a tiempo.',
      }
    case 'declined':
      return {
        title: 'Paciente no disponible',
        description: 'El paciente rechazo la invitacion y la videollamada ya no esta disponible.',
      }
    case 'ended':
      return {
        title: 'Videollamada finalizada',
        description: 'La sala se cerro antes de que la consulta pudiera comenzar.',
      }
    case 'waiting':
    default:
      return {
        title: 'Esperando al paciente',
        description: defaultMessage ?? 'La videollamada esta lista. Entraremos apenas el paciente acepte.',
      }
  }
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
  const [doctorWaitingState, setDoctorWaitingState] = useState<DoctorWaitingState>('idle')
  const [waitSecondsRemaining, setWaitSecondsRemaining] = useState(DOCTOR_NO_ANSWER_TIMEOUT_SECONDS)
  const [waitingActionError, setWaitingActionError] = useState<string | null>(null)
  const { context, loading: contextLoading, error: contextError } = useConsultationContext(roomId)
  const {
    session: callSession,
    loading: callSessionLoading,
    error: callSessionError,
    refresh: refreshCallSession,
  } = useCallSession(roomId, isReady)

  // Client-side TURN fallback — if bootstrap didn't include TURN, fetch from API
  const { iceServers: clientTurnServers } = useTurnCredentials('/api/doctors/turn-credentials')

  // Transcription — mandatory, automatic, silent
  const [transcriptionState, transcriptionActions] = useAudioTranscription('es-AR')
  const callStartTimeRef = useRef<number | null>(null)
  const transcriptionSavedRef = useRef(false)
  const transcriptionStartedRef = useRef(false)
  const callServiceRef = useRef<ReturnType<typeof createCallService> | null>(null)
  const waitingTimeoutHandledRef = useRef(false)

  // Request notification permission for incoming patient notifications
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const typedProfile = profile as (UserProfile & { role?: string; email?: string }) | null
  const callSessionId = callSession?.callId?.trim() ?? ''
  const renderableCallSession =
    Boolean(callSession)
    && callSessionId.length > 0
    && (callSession?.roomId?.trim().length ?? 0) > 0
    && (callSession?.user.id?.trim().length ?? 0) > 0
    && (callSession?.user.role?.trim().length ?? 0) > 0
  const isDoctorWaitingRoomEnabled = callSession?.user.role === 'doctor' && callSession.waitingRoom.enabled
  const showDoctorWaitingRoom =
    renderableCallSession &&
    callSession.user.role === 'doctor' &&
    doctorWaitingState !== 'idle'

  function getCallService() {
    if (!callServiceRef.current) {
      callServiceRef.current = createCallService(createBrowserClient())
    }

    return callServiceRef.current
  }

  useEffect(() => {
    if (loading) return

    if (!session) {
      const authOrigin = getClientEnvOrDefault(
        'PUBLIC_APP_URL',
        import.meta.env.MODE === 'production'
          ? 'https://www.autamedica.com'
          : 'http://localhost:3000'
      )
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

  useEffect(() => {
    if (callSession?.user.role !== 'doctor') {
      setDoctorWaitingState('idle')
      setWaitSecondsRemaining(DOCTOR_NO_ANSWER_TIMEOUT_SECONDS)
      waitingTimeoutHandledRef.current = false
      setWaitingActionError(null)
      return
    }

    if (callSession.waitingRoom.enabled) {
      setDoctorWaitingState('waiting')
      setWaitSecondsRemaining(getWaitingSecondsRemaining(callSession.waitingRoom.deadlineAt))
      waitingTimeoutHandledRef.current = false
      setWaitingActionError(null)
      return
    }

    setDoctorWaitingState('idle')
    setWaitingActionError(null)
  }, [callSession])

  useEffect(() => {
    if (!isReady || !callSessionId || !isDoctorWaitingRoomEnabled || doctorWaitingState === 'idle') {
      return
    }

    const callService = getCallService()
    const unsubscribe = callService.subscribeToCall(callSessionId, (nextCall) => {
      if (nextCall.status === 'accepted' || nextCall.status === 'connecting' || nextCall.status === 'connected') {
        setDoctorWaitingState('idle')
        setWaitingActionError(null)
        return
      }

      if (nextCall.status === 'declined') {
        setDoctorWaitingState('declined')
        return
      }

      if (nextCall.status === 'canceled') {
        setDoctorWaitingState(nextCall.reason === 'no_answer_timeout' ? 'timed_out' : 'canceled')
        return
      }

      if (nextCall.status === 'ended') {
        setDoctorWaitingState('ended')
        return
      }

      setDoctorWaitingState((current) => (current === 'canceling' ? current : 'waiting'))
    })

    return () => {
      unsubscribe()
    }
  }, [callSessionId, doctorWaitingState, isDoctorWaitingRoomEnabled, isReady])

  const cancelWaitingCall = useCallback(
    async (reason: 'doctor_canceled' | 'no_answer_timeout') => {
      if (!callSession) {
        return
      }

      setDoctorWaitingState('canceling')
      setWaitingActionError(null)

      try {
        await cancelCallBrowserService.cancel(callSession.callId, { reason })
        setDoctorWaitingState(reason === 'no_answer_timeout' ? 'timed_out' : 'canceled')
      } catch (error) {
        logger.error('[DoctorCallPage] Failed to cancel waiting call', error)
        const message = error instanceof Error ? error.message : 'No pudimos cancelar la videollamada'

        if (message === 'call_not_cancelable') {
          setDoctorWaitingState('idle')
          return
        }

        setDoctorWaitingState('waiting')
        setWaitingActionError('No pudimos cancelar la videollamada. Reintentá en unos segundos.')
      }
    },
    [callSession]
  )

  useEffect(() => {
    if (!showDoctorWaitingRoom || doctorWaitingState !== 'waiting') {
      return
    }

    const syncDeadline = () => {
      const remainingSeconds = getWaitingSecondsRemaining(callSession?.waitingRoom.deadlineAt)
      setWaitSecondsRemaining(remainingSeconds)

      if (remainingSeconds > 0 || waitingTimeoutHandledRef.current) {
        return
      }

      waitingTimeoutHandledRef.current = true
      void cancelWaitingCall('no_answer_timeout')
    }

    syncDeadline()

    const intervalId = window.setInterval(syncDeadline, 1000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncDeadline()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [callSession?.waitingRoom.deadlineAt, cancelWaitingCall, doctorWaitingState, showDoctorWaitingRoom])

  // REMOVED AGGRESSIVE POLLING: Realtime updates are handled by `callService.subscribeToCall`.

  const saveTranscription = useCallback(async (segments: TranscriptSegment[]) => {
    if (transcriptionSavedRef.current || segments.length === 0) return
    transcriptionSavedRef.current = true

    const finalSegments = segments.filter(s => s.isFinal)
    if (finalSegments.length === 0) return

    const fullText = finalSegments.map(s => s.text).join(' ')
    const durationSeconds = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : undefined

    try {
      await fetch(`/api/doctors/consultations/${roomId}/transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: finalSegments,
          fullText,
          durationSeconds,
          consentDoctor: true,
          lang: 'es-AR',
        }),
      })
    } catch (err) {
      logger.error('[DoctorCallPage] Failed to save transcription', err)
    }
  }, [roomId])

  const handleCallEnd = useCallback(() => {
    if (transcriptionState.isTranscribing) {
      transcriptionActions.stop()
    }
    saveTranscription(transcriptionState.segments)
    // Redirect to post-consultation report page
    window.location.href = `/doctors/call/${roomId}/report`
  }, [roomId, transcriptionState.segments, transcriptionState.isTranscribing, transcriptionActions, saveTranscription])

  const handleCallStart = useCallback(() => {
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
  }, [transcriptionState.isSupported, transcriptionActions])

  const handlePersistCallStatus = useCallback(
    async (status: CallStatus, reason?: string) => {
      if (!callSession) {
        return
      }

      if (status !== 'connecting' && status !== 'connected' && status !== 'ended') {
        return
      }

      await persistCallStatusBrowserService.persist(callSession.callId, {
        status,
        ...(reason ? { reason } : {}),
      })
    },
    [callSession]
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

  if (callSessionError) {
    const errorInfo = translateCallError(callSessionError)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600/80">
            Telemedicina profesional
          </p>
          <div className="mx-auto mb-4 mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg className="h-7 w-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{errorInfo.title}</h1>
          <p className="mt-3 text-sm text-slate-500">{errorInfo.description}</p>
          {errorInfo.retryHint && (
            <p className="mt-2 text-sm text-amber-600">{errorInfo.retryHint}</p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void refreshCallSession()}
              className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/doctors' }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Volver al portal
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading || !isReady || callSessionLoading || !callSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600/80">
            Telemedicina profesional
          </p>
          <div className="mx-auto mb-4 mt-5 h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-500"></div>
          <h1 className="text-xl font-semibold text-slate-900">Preparando videollamada...</h1>
          <p className="mt-3 text-sm text-slate-500">
            Estamos validando la sala, el contexto clínico y la conexión segura antes de ingresar.
          </p>
        </div>
      </div>
    )
  }

  if (!renderableCallSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600/80">
            Telemedicina profesional
          </p>
          <div className="mx-auto mb-4 mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <svg className="h-7 w-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">La videollamada quedó inconsistente</h1>
          <p className="mt-3 text-sm text-slate-500">
            Recibimos una sesión parcial. Reintentá para reconstruir la llamada antes de volver a entrar.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void refreshCallSession()}
              className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/doctors' }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Volver al portal
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-slate-50 overflow-hidden flex">
      {/* Video Call */}
      <div className={`flex-1 min-w-0 transition-all duration-300 relative ${panelCollapsed ? '' : 'mr-0'}`}>
        {showDoctorWaitingRoom ? (
          <div className="h-screen flex items-center justify-center px-6">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${
                    doctorWaitingState === 'waiting' ? 'text-emerald-600/80' : 'text-slate-500/80'
                  }`}>
                    {doctorWaitingState === 'waiting' ? 'Videollamada lista' : 'Videollamada finalizada'}
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold text-slate-900">
                    {getWaitingCopy(doctorWaitingState, callSession.waitingRoom.message).title}
                  </h1>
                </div>
                <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  doctorWaitingState === 'waiting'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : doctorWaitingState === 'canceling'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}>
                  {doctorWaitingState === 'waiting'
                    ? formatCountdown(waitSecondsRemaining)
                    : doctorWaitingState === 'canceling'
                      ? 'Procesando'
                      : 'Cerrada'}
                </div>
              </div>

              <p className="mt-4 text-base leading-7 text-slate-600">
                {getWaitingCopy(doctorWaitingState, callSession.waitingRoom.message).description}
              </p>

              <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Estado de invitacion</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {doctorWaitingState === 'waiting'
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
                {doctorWaitingState === 'waiting' || doctorWaitingState === 'canceling' ? (
                  <button
                    type="button"
                    onClick={() => void cancelWaitingCall('doctor_canceled')}
                    disabled={doctorWaitingState === 'canceling'}
                    className="inline-flex items-center justify-center rounded-2xl bg-white border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Ir al inicio medico
                </button>
              </div>
            </div>
          </div>
        ) : (
          <UnifiedVideoCall
            roomId={callSession.roomId}
            callId={callSession.callId}
            userId={callSession.user.id || userId}
            userType={callSession.user.role}
            userName={callSession.user.displayName || userName}
            iceServers={clientTurnServers ?? callSession.transport.iceServers}
            cloudflareCallsApiUrl={
              callSession.runtime === 'webrtc-p2p'
                ? null
                : (callSession.transport.cloudflareCallsApiUrl ?? null)
            }
            theme="doctor"
            onCallEnd={handleCallEnd}
            onCallStart={handleCallStart}
            persistCallStatus={handlePersistCallStatus}
            callService={getCallService()}
            autoStart
            className="h-screen"
          />
        )}

        {/* Transcription active indicator — minimal, non-intrusive */}
        {!showDoctorWaitingRoom && transcriptionState.isTranscribing && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-white border border-red-100 rounded-full px-3 py-1.5 shadow-sm" title="Transcripción activa">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold text-red-600 select-none">REC</span>
          </div>
        )}
      </div>

      {/* Clinical Context Panel */}
      <div className={`shrink-0 transition-all duration-300 ${panelCollapsed ? 'w-0' : 'w-80'} bg-white border-l border-slate-200`}>
        <ConsultationContextPanel
          context={context}
          loading={contextLoading}
          error={contextError}
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed(prev => !prev)}
        />
      </div>
    </div>
  )
}
