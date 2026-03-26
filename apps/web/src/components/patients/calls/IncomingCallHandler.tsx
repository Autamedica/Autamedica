'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@autamedica/auth'
import { createCallService } from '@autamedica/telemedicine'
import type { Call, InviteMessage } from '@autamedica/telemedicine'
import { logger } from '@autamedica/shared'
import { respondCallBrowserService } from '@/lib/calls/services/respond-call.browser'
import { selectCurrentIncomingCall } from '@/lib/calls/services/select-current-incoming-call'

function tryShowBrowserNotification(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/icons/logo-192.png', tag: 'incoming-call' })
  } catch {
    // Notification constructor may fail in some contexts
  }
}

interface IncomingCallHandlerProps {
  patientId: string
  patientName?: string
  focusAppointmentId?: string | null
}

export function IncomingCallHandler({
  patientId,
  patientName: _patientName = 'Paciente',
  focusAppointmentId = null,
}: IncomingCallHandlerProps) {
  const [incomingCall, setIncomingCall] = useState<InviteMessage | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const callServiceRef = useRef<ReturnType<typeof createCallService> | null>(null)
  const ringtoneContextRef = useRef<AudioContext | null>(null)
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const trackedCallsRef = useRef<Map<string, Call>>(new Map())

  const stopIncomingRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current)
      ringtoneIntervalRef.current = null
    }
  }, [])

  const playIncomingRingtoneBurst = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }

    const AudioContextCtor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) {
      return
    }

    try {
      let ctx = ringtoneContextRef.current

      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextCtor()
        ringtoneContextRef.current = ctx
      }

      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const activeContext = ctx
      const baseTime = activeContext.currentTime + 0.02
      const master = activeContext.createGain()
      master.gain.setValueAtTime(0.0001, baseTime)
      master.gain.exponentialRampToValueAtTime(0.12, baseTime + 0.03)
      master.gain.exponentialRampToValueAtTime(0.0001, baseTime + 0.62)
      master.connect(activeContext.destination)

      const notes = [
        { frequency: 659.25, offset: 0 },
        { frequency: 830.61, offset: 0.18 },
      ]

      notes.forEach(({ frequency, offset }) => {
        const startAt = baseTime + offset
        const oscillator = activeContext.createOscillator()
        const gain = activeContext.createGain()

        oscillator.type = 'triangle'
        oscillator.frequency.setValueAtTime(frequency, startAt)
        gain.gain.setValueAtTime(0.0001, startAt)
        gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18)

        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(startAt)
        oscillator.stop(startAt + 0.2)
      })
    } catch {
      // Best-effort ringtone only.
    }
  }, [])

  const startIncomingRingtone = useCallback(() => {
    stopIncomingRingtone()
    void playIncomingRingtoneBurst()
    ringtoneIntervalRef.current = setInterval(() => {
      void playIncomingRingtoneBurst()
    }, 2400)
  }, [playIncomingRingtoneBurst, stopIncomingRingtone])

  function getCallService() {
    if (!callServiceRef.current) {
      try {
        callServiceRef.current = createCallService(createBrowserClient())
      } catch (err) {
        logger.warn('[IncomingCallHandler] Failed to create call service:', err)
        return null
      }
    }
    return callServiceRef.current
  }

  const showIncomingCall = useCallback((call: Pick<Call, 'id' | 'room_id' | 'doctor_id' | 'patient_id'>) => {
    const inviteMessage: InviteMessage = {
      type: 'invite',
      callId: call.id,
      roomId: call.room_id,
      from: { doctorId: call.doctor_id, name: 'Doctor' },
      to: { patientId: call.patient_id },
    }

    setIncomingCall(inviteMessage)
    tryShowBrowserNotification(
      'Videollamada entrante',
      `${inviteMessage.from.name || 'Tu doctor'} te está llamando`,
    )
  }, [])

  const syncIncomingCall = useCallback(() => {
    const nextCall = selectCurrentIncomingCall(
      Array.from(trackedCallsRef.current.values()),
      { focusAppointmentId },
    )

    if (!nextCall) {
      setIncomingCall(null)
      setIsConnecting(false)
      return
    }

    setIncomingCall((currentInvite) => {
      if (currentInvite?.callId === nextCall.id) {
        return currentInvite
      }

      const inviteMessage: InviteMessage = {
        type: 'invite',
        callId: nextCall.id,
        roomId: nextCall.room_id,
        from: { doctorId: nextCall.doctor_id, name: 'Doctor' },
        to: { patientId: nextCall.patient_id },
      }

      tryShowBrowserNotification(
        'Videollamada entrante',
        `${inviteMessage.from.name || 'Tu doctor'} te está llamando`,
      )

      return inviteMessage
    })
  }, [focusAppointmentId])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    return () => {
      stopIncomingRingtone()
      if (ringtoneContextRef.current?.state !== 'closed') {
        void ringtoneContextRef.current?.close()
      }
      ringtoneContextRef.current = null
    }
  }, [stopIncomingRingtone])

  useEffect(() => {
    if (incomingCall && !isConnecting) {
      startIncomingRingtone()
      return
    }

    stopIncomingRingtone()
  }, [incomingCall, isConnecting, startIncomingRingtone, stopIncomingRingtone])

  useEffect(() => {
    if (!incomingCall) {
      return
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isConnecting) {
        void playIncomingRingtoneBurst()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [incomingCall, isConnecting, playIncomingRingtoneBurst])

  useEffect(() => {
    if (!patientId) {
      logger.warn('[IncomingCallHandler] No hay patientId configurado — llamadas entrantes no monitoreadas')
      return
    }

    const callService = getCallService()
    if (!callService) return

    const setupCallListener = async () => {
      try {
        const subscription = callService.subscribeToUserCalls(patientId, 'patient', (call) => {
          logger.info('[IncomingCallHandler] New call received:', call)

          if (call.status === 'ringing') {
            trackedCallsRef.current.set(call.id, call)
            syncIncomingCall()
          } else if (call.status === 'canceled' || call.status === 'declined' || call.status === 'ended') {
            trackedCallsRef.current.delete(call.id)
            syncIncomingCall()
          } else {
            trackedCallsRef.current.set(call.id, call)
            syncIncomingCall()
          }
        })

        const activeCalls = await callService.getActiveCallsForPatient(patientId)
        trackedCallsRef.current = new Map(activeCalls.map((call) => [call.id, call]))
        const ringingCall = selectCurrentIncomingCall(activeCalls, { focusAppointmentId })
        if (ringingCall) {
          logger.info('[IncomingCallHandler] Found current ringing call on mount:', ringingCall)
          showIncomingCall(ringingCall)
        }

        return subscription
      } catch (error) {
        logger.error('[IncomingCallHandler] Failed to setup call listener:', error)
        return () => {}
      }
    }

    let subscription: (() => void) | null = null
    void setupCallListener().then((sub) => {
      subscription = sub
    })

    return () => {
      if (subscription) subscription()
    }
  }, [focusAppointmentId, patientId, showIncomingCall, syncIncomingCall])

  const handleAccept = async () => {
    if (!incomingCall) return

    setIsConnecting(true)
    stopIncomingRingtone()

    try {
      const response = await respondCallBrowserService.respond({
        callId: incomingCall.callId,
        action: 'accept',
      })
      window.location.href = `/patients/call/${response.roomId}?callId=${response.callId}`
    } catch (error) {
      logger.error('[IncomingCallHandler] Failed to accept call:', error)
      setIsConnecting(false)
    }
  }

  const handleDecline = async () => {
    if (!incomingCall) return

    try {
      stopIncomingRingtone()
      await respondCallBrowserService.respond({
        callId: incomingCall.callId,
        action: 'decline',
      })
      setIncomingCall(null)
    } catch (error) {
      logger.error('[IncomingCallHandler] Failed to decline call:', error)
    }
  }

  if (!incomingCall) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
            <div className="absolute inset-0 animate-ping rounded-full border-4 border-blue-400/30"></div>
            <svg className="relative z-10 h-10 w-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>

          <h2 className="mb-2 text-xl font-semibold text-gray-800">Videollamada entrante</h2>

          <p className="text-gray-600">
            {incomingCall.from.name || 'Doctor'} te está llamando
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Atendé para entrar ahora mismo a la teleconsulta.
          </p>
        </div>

        <div className="mb-6 flex justify-center">
          <div className="flex space-x-1">
            <div className="h-2 w-2 animate-bounce rounded-full bg-green-500"></div>
            <div className="h-2 w-2 animate-bounce rounded-full bg-green-500" style={{ animationDelay: '0.1s' }}></div>
            <div className="h-2 w-2 animate-bounce rounded-full bg-green-500" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleDecline}
            disabled={isConnecting}
            className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-red-600 px-4 py-3 text-white hover:bg-red-700 disabled:opacity-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Rechazar</span>
          </button>

          <button
            onClick={handleAccept}
            disabled={isConnecting}
            className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-green-600 px-4 py-3 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isConnecting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>Atender videollamada</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void playIncomingRingtoneBurst()}
            disabled={isConnecting}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            Probar sonido
          </button>
          <span className="text-xs text-gray-400">Llamada {incomingCall.callId.slice(-8)}</span>
        </div>
      </div>
    </div>
  )
}
