'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCallService, createTelemedicineLogger, TelemedicineDebugPanel } from '@autamedica/telemedicine'
import type { Call } from '@autamedica/telemedicine'

import { logger } from '@autamedica/shared'

const WAITING_TIMEOUT_SECONDS = 90

interface WaitingRoomProps {
  callId: string
  doctorId: string
  roomId: string
  debugEnabled?: boolean
}

type WaitingState = 'ringing' | 'accepted' | 'declined' | 'canceled' | 'timeout'

function isReadyToJoin(status: Call['status']): boolean {
  return status === 'accepted' || status === 'connecting' || status === 'connected'
}

export function WaitingRoom({ callId, doctorId, roomId, debugEnabled = false }: WaitingRoomProps) {
  const [state, setState] = useState<WaitingState>('ringing')
  const [timeLeft, setTimeLeft] = useState(WAITING_TIMEOUT_SECONDS)
  const [_call, setCall] = useState<Call | null>(null)
  const [isResending, setIsResending] = useState(false)
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const debugLogger = useMemo(
    () => createTelemedicineLogger({
      source: 'DoctorWaitingRoom',
      callId,
      roomId,
      userId: doctorId,
      userType: 'doctor',
    }),
    [callId, doctorId, roomId]
  )

  useEffect(() => {
    const callService = createCallService()
    debugLogger.info('Entrando en sala de espera del medico')
    void callService.logDebugEvent(callId, 'info', 'DoctorWaitingRoom', 'Entrando en sala de espera', {
      roomId,
      doctorId,
    })

    // Load call details and setup realtime subscription
    const setupCall = async () => {
      try {
        // Load initial call data
        const callData = await callService.getCall(callId)
        debugLogger.info('Estado inicial de llamada cargado', {
          status: callData?.status ?? 'missing',
        })
        setCall(callData)

        // If call is already accepted/declined, update state immediately
        if (callData?.status && isReadyToJoin(callData.status)) {
          setState('accepted')
          setTimeout(() => {
            router.push(`/call/${roomId}/${callId}`)
          }, 1000)
          return null
        } else if (callData?.status === 'declined') {
          setState('declined')
          return null
        }

        // Subscribe to realtime changes on this specific call
        const subscription = callService.subscribeToCall(callId, (updatedCall) => {
          debugLogger.info('Cambio realtime recibido en sala de espera', {
            status: updatedCall.status,
          })
          setCall(updatedCall)

          switch (updatedCall.status) {
            case 'accepted':
            case 'connecting':
            case 'connected':
              setState('accepted')
              void callService.logDebugEvent(callId, 'info', 'DoctorWaitingRoom', 'Paciente listo para ingresar', {
                status: updatedCall.status,
              })
              // Navigate to call room
              setTimeout(() => {
                router.push(`/call/${roomId}/${callId}`)
              }, 1000)
              break
            case 'declined':
              setState('declined')
              void callService.logDebugEvent(callId, 'warn', 'DoctorWaitingRoom', 'Paciente rechazo la llamada')
              break
            case 'canceled':
            case 'ended':
              setState('canceled')
              void callService.logDebugEvent(callId, 'warn', 'DoctorWaitingRoom', 'Llamada cancelada o finalizada antes de entrar', {
                status: updatedCall.status,
              })
              break
          }
        })

        // Setup timeout timer
        timeoutTimerRef.current = setInterval(() => {
          setTimeLeft(prev => {
            if (prev <= 1) {
              setState('timeout')
              debugLogger.warn('Timeout agotado en sala de espera')
              void callService.logDebugEvent(callId, 'warn', 'DoctorWaitingRoom', 'Timeout agotado en sala de espera')
              callService.updateCallStatus(callId, 'canceled', 'timeout').catch((err: unknown) => logger.error('Failed to update call status:', err))
              return 0
            }
            return prev - 1
          })
        }, 1000)

        return subscription
      } catch (error) {
        debugLogger.error('Fallo al preparar sala de espera', error)
        void callService.logDebugEvent(callId, 'error', 'DoctorWaitingRoom', 'Fallo al preparar sala de espera', {
          error,
        })
        logger.error('Failed to setup call:', error)
        setState('canceled')
        return null
      }
    }

    let subscription: (() => void) | null = null
    setupCall().then(sub => { subscription = sub })

    // Cleanup
    return () => {
      debugLogger.info('Saliendo de sala de espera del medico')
      if (timeoutTimerRef.current) clearInterval(timeoutTimerRef.current)
      if (subscription) subscription()
    }
  }, [callId, debugLogger, doctorId, roomId, router])

  const handleCancel = async () => {
    try {
      const callService = createCallService()
      debugLogger.warn('Doctor cancelo la llamada desde sala de espera')
      await callService.logDebugEvent(callId, 'warn', 'DoctorWaitingRoom', 'Doctor cancelo la llamada')
      await callService.updateCallStatus(callId, 'canceled', 'doctor_canceled')
      router.back()
    } catch (error) {
      debugLogger.error('Fallo al cancelar llamada desde sala de espera', error)
      logger.error('Failed to cancel call:', error)
    }
  }

  const handleResend = async () => {
    if (isResending) return
    setIsResending(true)
    try {
      const callService = createCallService()
      debugLogger.info('Doctor reenvía notificación al paciente', { callId })
      await callService.updateCallStatus(callId, 'ringing')
      await callService.logDebugEvent(callId, 'info', 'DoctorWaitingRoom', 'Doctor reenvió notificación')
      // Reiniciar el timer
      setTimeLeft(WAITING_TIMEOUT_SECONDS)
    } catch (error) {
      debugLogger.error('Fallo al reenviar notificación', error)
      logger.error('Failed to resend notification:', error)
    } finally {
      setIsResending(false)
    }
  }

  const patientCallUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace('doctors', 'patients')}/call/${roomId}/${callId}`
    : `/call/${roomId}/${callId}`

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-slate-900 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white/10 backdrop-blur-md p-8 shadow-2xl ring-1 ring-white/20 text-center">

        {/* Avatar con animación */}
        <div className="mb-6">
          {state === 'ringing' ? (
            <div className="relative mx-auto mb-2 flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-violet-400/30" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/30 ring-2 ring-violet-400/50">
                <svg className="w-10 h-10 text-violet-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
            </div>
          ) : state === 'accepted' ? (
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/30 ring-2 ring-emerald-400/50">
              <svg className="w-10 h-10 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/30 ring-2 ring-red-400/50">
              <svg className="w-10 h-10 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        {/* Título y estado */}
        <h2 className="mb-1 text-lg font-semibold text-white">
          {state === 'ringing' ? 'Esperando al paciente' : state === 'accepted' ? 'Paciente conectándose' : 'Llamada finalizada'}
        </h2>
        <p className="mb-4 text-sm text-violet-300">
          {state === 'ringing'
            ? `Notificación enviada — ${timeLeft}s restantes`
            : state === 'accepted'
            ? 'El paciente aceptó la llamada. Ingresando a la sala...'
            : state === 'declined'
            ? 'El paciente rechazó la llamada'
            : state === 'timeout'
            ? 'El paciente no respondió a tiempo'
            : 'Llamada cancelada'}
        </p>

        {/* Barra de progreso */}
        {state === 'ringing' && (
          <div className="w-full bg-white/10 rounded-full h-1.5 mb-6">
            <div
              className="bg-violet-400 h-1.5 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(timeLeft / WAITING_TIMEOUT_SECONDS) * 100}%` }}
            />
          </div>
        )}

        {/* Link de sala para compartir */}
        {state === 'ringing' && (
          <div className="mb-6 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <p className="mb-1 text-[11px] text-violet-400">Enlace directo para el paciente</p>
            <p className="break-all text-[11px] text-white/70 font-mono">{patientCallUrl}</p>
            <button
              onClick={() => { void navigator.clipboard?.writeText(patientCallUrl) }}
              className="mt-2 text-[11px] text-violet-300 hover:text-violet-100 transition-colors"
            >
              Copiar enlace
            </button>
          </div>
        )}

        {/* Botones de acción */}
        <div className="space-y-2">
          {state === 'ringing' && (
            <>
              <button
                onClick={() => { void handleResend() }}
                disabled={isResending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                {isResending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span>Reenviar notificación</span>
                  </>
                )}
              </button>
              <button
                onClick={() => { void handleCancel() }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/20"
              >
                Cancelar llamada
              </button>
            </>
          )}

          {(state === 'declined' || state === 'timeout' || state === 'canceled') && (
            <button
              onClick={() => router.back()}
              className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500"
            >
              Volver
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-white/30">#{callId.slice(-8)}</p>
      </div>

      {debugEnabled && (
        <TelemedicineDebugPanel
          callId={callId}
          roomId={roomId}
          className="mt-6"
          title="Sala de espera del medico"
          initiallyOpen={false}
          compact={false}
        />
      )}
    </div>
  )
}
