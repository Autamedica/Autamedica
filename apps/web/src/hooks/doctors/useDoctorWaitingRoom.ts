'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CallSessionBootstrap, CallService } from '@autamedica/telemedicine'
import { logger } from '@autamedica/shared'
import { cancelCallBrowserService } from '@/lib/calls/services/cancel-call.browser'

export type DoctorWaitingState =
  | 'idle'
  | 'waiting'
  | 'canceling'
  | 'canceled'
  | 'timed_out'
  | 'declined'
  | 'ended'

const DOCTOR_NO_ANSWER_TIMEOUT_SECONDS = 300
const DEADLINE_SERVER_SYNC_MS = 15_000

function getWaitingSecondsRemaining(deadlineAt?: string): number {
  if (!deadlineAt) return DOCTOR_NO_ANSWER_TIMEOUT_SECONDS
  const deadlineMs = Date.parse(deadlineAt)
  if (Number.isNaN(deadlineMs)) return DOCTOR_NO_ANSWER_TIMEOUT_SECONDS
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
}

export function formatWaitingCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function getWaitingCopy(
  state: DoctorWaitingState,
  defaultMessage?: string,
): { title: string; description: string } {
  switch (state) {
    case 'canceling':
      return { title: 'Cancelando videollamada...', description: 'Estamos cerrando la invitacion para que el paciente ya no vea esta llamada.' }
    case 'canceled':
      return { title: 'Videollamada cancelada', description: 'La invitacion se cerro antes de que el paciente se conectara.' }
    case 'timed_out':
      return { title: 'Sin respuesta del paciente', description: 'La videollamada se cancelo automaticamente porque nadie respondio a tiempo.' }
    case 'declined':
      return { title: 'Paciente no disponible', description: 'El paciente rechazo la invitacion y la videollamada ya no esta disponible.' }
    case 'ended':
      return { title: 'Videollamada finalizada', description: 'La sala se cerro antes de que la consulta pudiera comenzar.' }
    case 'waiting':
    default:
      return { title: 'Esperando al paciente', description: defaultMessage ?? 'La videollamada esta lista. Entraremos apenas el paciente acepte.' }
  }
}

interface UseDoctorWaitingRoomConfig {
  callSession: CallSessionBootstrap | null
  getCallService: () => CallService | null
  refreshCallSession: () => Promise<void>
}

interface UseDoctorWaitingRoomResult {
  state: DoctorWaitingState
  secondsRemaining: number
  error: string | null
  showWaitingRoom: boolean
  cancelCall: (reason: 'doctor_canceled' | 'no_answer_timeout') => Promise<void>
}

export function useDoctorWaitingRoom({
  callSession,
  getCallService,
  refreshCallSession,
}: UseDoctorWaitingRoomConfig): UseDoctorWaitingRoomResult {
  const [state, setState] = useState<DoctorWaitingState>('idle')
  const [secondsRemaining, setSecondsRemaining] = useState(DOCTOR_NO_ANSWER_TIMEOUT_SECONDS)
  const [error, setError] = useState<string | null>(null)
  const timeoutHandledRef = useRef(false)
  const callSessionRef = useRef(callSession)
  callSessionRef.current = callSession

  const callSessionId = callSession?.callId?.trim() ?? ''
  const isDoctorWaitingEnabled = callSession?.user.role === 'doctor' && callSession.waitingRoom.enabled
  const showWaitingRoom = Boolean(callSession) && callSession?.user.role === 'doctor' && state !== 'idle'

  // Initialize waiting state from session
  useEffect(() => {
    if (callSession?.user.role !== 'doctor') {
      setState('idle')
      setSecondsRemaining(DOCTOR_NO_ANSWER_TIMEOUT_SECONDS)
      timeoutHandledRef.current = false
      setError(null)
      return
    }
    if (callSession.waitingRoom.enabled) {
      setState('waiting')
      setSecondsRemaining(getWaitingSecondsRemaining(callSession.waitingRoom.deadlineAt))
      timeoutHandledRef.current = false
      setError(null)
      return
    }
    setState('idle')
    setError(null)
  }, [callSession])

  // Subscribe to call status changes
  useEffect(() => {
    if (!callSessionId || !isDoctorWaitingEnabled || state === 'idle') return

    const callService = getCallService()
    if (!callService) return

    const unsubscribe = callService.subscribeToCall(callSessionId, (nextCall) => {
      if (nextCall.status === 'accepted' || nextCall.status === 'connecting' || nextCall.status === 'connected') {
        setState('idle')
        setError(null)
        return
      }
      if (nextCall.status === 'declined') { setState('declined'); return }
      if (nextCall.status === 'canceled') {
        setState(nextCall.reason === 'no_answer_timeout' ? 'timed_out' : 'canceled')
        return
      }
      if (nextCall.status === 'ended') { setState('ended'); return }
      setState((cur) => (cur === 'canceling' ? cur : 'waiting'))
    })

    return () => { unsubscribe() }
  }, [callSessionId, isDoctorWaitingEnabled, state, getCallService])

  const cancelCall = useCallback(async (reason: 'doctor_canceled' | 'no_answer_timeout') => {
    const session = callSessionRef.current
    if (!session) return
    setState('canceling')
    setError(null)
    try {
      await cancelCallBrowserService.cancel(session.callId, { reason })
      setState(reason === 'no_answer_timeout' ? 'timed_out' : 'canceled')
    } catch (err) {
      logger.error('[useDoctorWaitingRoom] Failed to cancel', err)
      const msg = err instanceof Error ? err.message : 'No pudimos cancelar la videollamada'
      if (msg === 'call_not_cancelable') { setState('idle'); return }
      setState('waiting')
      setError('No pudimos cancelar la videollamada. Reintenta en unos segundos.')
    }
  }, [])

  // Countdown + periodic server sync
  useEffect(() => {
    if (!showWaitingRoom || state !== 'waiting') return

    const syncDeadline = () => {
      const remaining = getWaitingSecondsRemaining(callSessionRef.current?.waitingRoom.deadlineAt)
      setSecondsRemaining(remaining)
      if (remaining > 0 || timeoutHandledRef.current) return
      timeoutHandledRef.current = true
      void cancelCall('no_answer_timeout')
    }

    syncDeadline()
    const countdownId = window.setInterval(syncDeadline, 1000)

    let lastSync = Date.now()
    const serverSyncId = window.setInterval(() => {
      if (Date.now() - lastSync >= DEADLINE_SERVER_SYNC_MS) {
        lastSync = Date.now()
        refreshCallSession()
      }
    }, DEADLINE_SERVER_SYNC_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncDeadline()
        refreshCallSession()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(countdownId)
      window.clearInterval(serverSyncId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [state, showWaitingRoom, refreshCallSession, cancelCall])

  return { state, secondsRemaining, error, showWaitingRoom, cancelCall }
}
