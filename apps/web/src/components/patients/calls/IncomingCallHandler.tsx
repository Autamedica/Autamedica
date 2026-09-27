'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BellRing, CheckCircle2, PhoneIncoming, Volume2, VolumeX, X } from 'lucide-react'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
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

type AudioAvailability = 'idle' | 'ready' | 'playing' | 'blocked' | 'unsupported'

type AppointmentDoctorLookupRow = {
  doctor?: {
    profile?: {
      first_name: string | null
      last_name: string | null
    } | null
  } | null
}

type DoctorLookupRow = {
  profile?: {
    first_name: string | null
    last_name: string | null
  } | null
}

function formatDoctorName(input: { first_name?: string | null; last_name?: string | null } | null | undefined): string | undefined {
  const fullName = [input?.first_name, input?.last_name].filter(Boolean).join(' ').trim()
  if (fullName.length === 0) {
    return undefined
  }

  return `Dr. ${fullName}`
}

function toInviteMessage(
  call: Pick<Call, 'id' | 'room_id' | 'doctor_id' | 'patient_id'>,
  doctorName?: string,
): InviteMessage {
  return {
    type: 'invite',
    callId: call.id,
    roomId: call.room_id,
    from: { doctorId: call.doctor_id, name: doctorName || 'Tu médico' },
    to: { patientId: call.patient_id },
  }
}

export function IncomingCallHandler({
  patientId,
  patientName: _patientName = 'Paciente',
  focusAppointmentId = null,
}: IncomingCallHandlerProps) {
  const [incomingCall, setIncomingCall] = useState<InviteMessage | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [audioAvailability, setAudioAvailability] = useState<AudioAvailability>('idle')
  const callServiceRef = useRef<ReturnType<typeof createCallService> | null>(null)
  const browserClientRef = useRef<ReturnType<typeof getBrowserSupabaseClient> | null>(null)
  const ringtoneContextRef = useRef<AudioContext | null>(null)
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const trackedCallsRef = useRef<Map<string, Call>>(new Map())

  const stopIncomingRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current)
      ringtoneIntervalRef.current = null
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0)
    }
  }, [])

  const getBrowserClient = useCallback(() => {
    if (!browserClientRef.current) {
      browserClientRef.current = getBrowserSupabaseClient()
    }

    return browserClientRef.current
  }, [])

  const ensureRingtoneContext = useCallback(async (interactive: boolean): Promise<AudioContext | null> => {
    if (typeof window === 'undefined') {
      return null
    }

    const AudioContextCtor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) {
      setAudioAvailability('unsupported')
      return null
    }

    try {
      let ctx = ringtoneContextRef.current

      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextCtor()
        ringtoneContextRef.current = ctx
      }

      if (ctx.state === 'suspended') {
        if (!interactive) {
          setAudioAvailability('blocked')
          return null
        }

        await ctx.resume()
      }

      if (ctx.state !== 'running') {
        setAudioAvailability('blocked')
        return null
      }

      setAudioAvailability('ready')
      return ctx
    } catch {
      setAudioAvailability('blocked')
      return null
    }
  }, [])

  const playIncomingRingtoneBurst = useCallback(async (interactive = false) => {
    const activeContext = await ensureRingtoneContext(interactive)
    if (!activeContext) {
      return false
    }

    try {
      const baseTime = activeContext.currentTime + 0.02
      const master = activeContext.createGain()
      master.gain.setValueAtTime(0.0001, baseTime)
      master.gain.exponentialRampToValueAtTime(0.25, baseTime + 0.025)
      master.gain.exponentialRampToValueAtTime(0.0001, baseTime + 1.5)
      master.connect(activeContext.destination)

      const notes = [
        { frequency: 440.0, offset: 0, gain: 0.28 },
        { frequency: 554.37, offset: 0.16, gain: 0.2 },
        { frequency: 659.26, offset: 0.34, gain: 0.14 },
      ]

      const partials = [
        { mult: 1, amp: 1 },
        { mult: 2, amp: 0.32 },
        { mult: 2.76, amp: 0.12 },
        { mult: 5.4, amp: 0.05 },
      ]

      notes.forEach(({ frequency, offset, gain }) => {
        const startAt = baseTime + offset

        partials.forEach(({ mult, amp }) => {
          const oscillator = activeContext.createOscillator()
          const partialGain = activeContext.createGain()

          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(frequency * mult, startAt)
          partialGain.gain.setValueAtTime(0.0001, startAt)
          partialGain.gain.exponentialRampToValueAtTime(gain * amp, startAt + 0.008)
          partialGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.4)

          oscillator.connect(partialGain)
          partialGain.connect(master)
          oscillator.start(startAt)
          oscillator.stop(startAt + 1.45)
        })
      })
      setAudioAvailability('playing')
      return true
    } catch {
      setAudioAvailability('blocked')
      return false
    }
  }, [ensureRingtoneContext])

  const startIncomingRingtone = useCallback(() => {
    stopIncomingRingtone()
    void playIncomingRingtoneBurst(false)

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([260, 120, 260])
    }

    ringtoneIntervalRef.current = setInterval(() => {
      void playIncomingRingtoneBurst(false)
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([220, 100, 220])
      }
    }, 3000)
  }, [playIncomingRingtoneBurst, stopIncomingRingtone])

  function getCallService() {
    if (!callServiceRef.current) {
      try {
        callServiceRef.current = createCallService(getBrowserSupabaseClient())
      } catch (err) {
        logger.warn('[IncomingCallHandler] Failed to create call service:', err)
        return null
      }
    }
    return callServiceRef.current
  }

  const resolveDoctorNameForCall = useCallback(async (call: Call): Promise<string | undefined> => {
    const browserClient = getBrowserClient()

    if (call.appointment_id) {
      const { data, error } = await browserClient
        .from('appointments')
        .select('doctor:doctors(profile:profiles!doctors_user_id_fkey(first_name, last_name))')
        .eq('id', call.appointment_id)
        .eq('patient_id', patientId)
        .maybeSingle()

      if (!error) {
        const appointment = data as AppointmentDoctorLookupRow | null
        const appointmentDoctorName = formatDoctorName(appointment?.doctor?.profile)
        if (appointmentDoctorName) {
          return appointmentDoctorName
        }
      }
    }

    const { data, error } = await browserClient
      .from('doctors')
      .select('profile:profiles!doctors_user_id_fkey(first_name, last_name)')
      .eq('id', call.doctor_id)
      .maybeSingle()

    if (error) {
      logger.warn('[IncomingCallHandler] Failed to resolve doctor display name', error)
      return undefined
    }

    const doctor = data as DoctorLookupRow | null
    return formatDoctorName(doctor?.profile)
  }, [getBrowserClient, patientId])

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

      const inviteMessage = toInviteMessage(nextCall)

      tryShowBrowserNotification(
        'Videollamada entrante',
        `${inviteMessage.from.name || 'Tu médico'} te está llamando`,
      )

      void resolveDoctorNameForCall(nextCall).then((doctorName) => {
        if (!doctorName) {
          return
        }

        setIncomingCall((current) => {
          if (current?.callId !== nextCall.id) {
            return current
          }

          return {
            ...current,
            from: {
              ...current.from,
              name: doctorName,
            },
          }
        })
      }).catch((error: unknown) => {
        logger.warn('[IncomingCallHandler] Doctor name resolution degraded', error)
      })

      return inviteMessage
    })
  }, [focusAppointmentId, resolveDoctorNameForCall])

  const refreshIncomingCall = useCallback(async (): Promise<Call | null> => {
    const callService = getCallService()
    if (!callService) {
      return null
    }

    const activeCalls = await callService.getActiveCallsForPatient(patientId)
    trackedCallsRef.current = new Map(activeCalls.map((call) => [call.id, call]))
    syncIncomingCall()

    return selectCurrentIncomingCall(activeCalls, { focusAppointmentId })
  }, [focusAppointmentId, patientId, syncIncomingCall])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const unlockAudio = () => {
      void ensureRingtoneContext(true)
    }

    document.addEventListener('click', unlockAudio, { once: true })
    document.addEventListener('touchstart', unlockAudio, { once: true })
    document.addEventListener('keydown', unlockAudio, { once: true })

    return () => {
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('touchstart', unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
      stopIncomingRingtone()
      if (ringtoneContextRef.current?.state !== 'closed') {
        void ringtoneContextRef.current?.close()
      }
      ringtoneContextRef.current = null
    }
  }, [ensureRingtoneContext, stopIncomingRingtone])

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
        void playIncomingRingtoneBurst(false)
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

        const refreshedCall = await refreshIncomingCall()
        if (refreshedCall) {
          logger.info('[IncomingCallHandler] Found current ringing call on mount:', refreshedCall)
        }

        return subscription
      } catch (error) {
        logger.error('[IncomingCallHandler] Failed to setup call listener:', error)
        return () => {}
      }
    }

    let subscription: (() => void) | null = null
    const onWindowFocus = () => {
      void refreshIncomingCall().catch(() => {})
    }

    window.addEventListener('focus', onWindowFocus)
    void setupCallListener().then((sub) => {
      subscription = sub
    })

    return () => {
      window.removeEventListener('focus', onWindowFocus)
      if (subscription) subscription()
    }
  }, [patientId, refreshIncomingCall])

  const handleAccept = async () => {
    if (!incomingCall) return

    setIsConnecting(true)
    stopIncomingRingtone()

    try {
      const currentCall = await refreshIncomingCall()
      const callToAccept = currentCall ? toInviteMessage(currentCall) : incomingCall

      if (currentCall && currentCall.id !== incomingCall.callId) {
        setIncomingCall(callToAccept)
      }

      const response = await respondCallBrowserService.respond({
        callId: callToAccept.callId,
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

  const handleEnableSound = async () => {
    await ensureRingtoneContext(true)
    await playIncomingRingtoneBurst(true)
  }

  if (!incomingCall) return null

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="w-full max-w-sm rounded-[28px] border border-white/10 bg-slate-900/95 p-6 text-white shadow-am-overlay backdrop-blur"
        initial={{ scale: 0.85, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12, mass: 0.8 }}
      >
        <div className="mb-6 text-center">
          <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-300 ring-8 ring-emerald-400/10">
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-emerald-400/20"
              animate={{ scale: [1, 2], opacity: [0.3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-emerald-400/15"
              animate={{ scale: [1, 1.8], opacity: [0.2, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
            />
            <PhoneIncoming className="relative z-10 h-9 w-9" />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Telemedicina paciente
          </p>
          <h2 className="mt-3 text-[28px] font-semibold leading-tight text-white">
            Videollamada entrante
          </h2>

          <p className="mt-3 text-base font-medium text-slate-100">
            {incomingCall.from.name || 'Tu médico'} te está llamando
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Atendé para entrar ahora mismo a la teleconsulta.
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-black/20 p-2 text-emerald-300">
              <BellRing className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-100">
                {audioAvailability === 'blocked'
                  ? 'El navegador bloqueó el tono automático'
                  : audioAvailability === 'unsupported'
                    ? 'Este dispositivo no permite tono web'
                    : audioAvailability === 'playing'
                      ? 'Tono de llamada activo'
                      : audioAvailability === 'ready'
                        ? 'Sonido preparado para llamadas'
                        : 'Preparando alerta de llamada'}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {audioAvailability === 'blocked'
                  ? 'Tocá “Activar sonido” para permitir el tono en este navegador.'
                  : 'Si estás lejos del teléfono, mantené esta pestaña activa para escuchar la llamada.'}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-center gap-2 text-emerald-600">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-2 w-2 rounded-full bg-current"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>

        <div className="flex space-x-3">
          <motion.button
            onClick={handleDecline}
            disabled={isConnecting}
            className="flex flex-1 items-center justify-center space-x-2 rounded-2xl bg-rose-600 px-4 py-3 text-white hover:bg-rose-700 disabled:opacity-50"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
          >
            <X className="h-5 w-5" />
            <span>Rechazar</span>
          </motion.button>

          <motion.button
            onClick={handleAccept}
            disabled={isConnecting}
            className="flex flex-1 items-center justify-center space-x-2 rounded-2xl bg-emerald-600 px-4 py-3 text-white hover:bg-emerald-700 disabled:opacity-50"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
          >
            {isConnecting ? (
              <>
                <motion.div
                  className="h-4 w-4 rounded-full border-2 border-white border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span>Atender videollamada</span>
              </>
            )}
          </motion.button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void handleEnableSound()}
            disabled={isConnecting}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 transition-colors hover:text-emerald-200 disabled:opacity-50"
          >
            {audioAvailability === 'blocked' ? (
              <>
                <VolumeX className="h-3.5 w-3.5" />
                Activar sonido
              </>
            ) : (
              <>
                <Volume2 className="h-3.5 w-3.5" />
                Probar sonido
              </>
            )}
          </button>
          <span className="text-xs text-slate-500">Llamada {incomingCall.callId.slice(-8)}</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
