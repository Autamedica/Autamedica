'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCallService, createTelemedicineLogger, type Call } from '@autamedica/telemedicine'
import { logger } from '@autamedica/shared'

interface IncomingCallHandlerProps {
  patientIds: string[]
}

interface IncomingCallState {
  callId: string
  roomId: string
  doctorId: string
  doctorName: string
  patientId: string
  createdAt: string
}

function normalizeIncomingCall(call: Call): IncomingCallState {
  return {
    callId: call.id,
    roomId: call.room_id,
    doctorId: call.doctor_id,
    doctorName: 'Doctor',
    patientId: call.patient_id,
    createdAt: call.created_at,
  }
}

function pickLatestRingingCall(calls: Call[]): IncomingCallState | null {
  const latest = calls
    .filter((call) => call.status === 'ringing')
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0]

  return latest ? normalizeIncomingCall(latest) : null
}

export function IncomingCallHandler({ patientIds }: IncomingCallHandlerProps) {
  const normalizedPatientIds = useMemo(
    () => Array.from(new Set(patientIds.map((value) => value.trim()).filter(Boolean))),
    [patientIds]
  )
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const router = useRouter()
  const debugLogger = useMemo(
    () => createTelemedicineLogger({
      source: 'IncomingCallHandler',
      userId: normalizedPatientIds[0],
      userType: 'patient',
    }),
    [normalizedPatientIds]
  )

  useEffect(() => {
    if (normalizedPatientIds.length === 0) {
      debugLogger.warn('No hay patientIds para escuchar llamadas entrantes')
      setIncomingCall(null)
      return
    }

    const callService = createCallService()
    const unsubscribers: Array<() => void> = []
    let isMounted = true

    const syncIncomingCall = (call: Call) => {
      if (!isMounted) {
        return
      }

      if (call.status === 'ringing') {
        debugLogger.info('Llamada entrante detectada', {
          callId: call.id,
          roomId: call.room_id,
          status: call.status,
        })
        void callService.logDebugEvent(call.id, 'info', 'IncomingCallHandler', 'Llamada entrante detectada', {
          roomId: call.room_id,
          patientIds: normalizedPatientIds,
        })
        setIncomingCall((previous) => {
          if (previous?.callId === call.id) {
            return previous
          }

          return normalizeIncomingCall(call)
        })
        setIsConnecting(false)
        return
      }

      if (call.status === 'accepted' || call.status === 'connecting' || call.status === 'connected') {
        debugLogger.info('Llamada entrante ya fue aceptada o conectada', {
          callId: call.id,
          status: call.status,
        })
        setIncomingCall((previous) => (previous?.callId === call.id ? null : previous))
        setIsConnecting(false)
        return
      }

      if (call.status === 'declined' || call.status === 'canceled' || call.status === 'ended') {
        debugLogger.warn('Llamada entrante cerrada antes de aceptar', {
          callId: call.id,
          status: call.status,
        })
        setIncomingCall((previous) => (previous?.callId === call.id ? null : previous))
        setIsConnecting(false)
      }
    }

    const loadExistingCalls = async () => {
      try {
        const activeCallLists = await Promise.all(
          normalizedPatientIds.map((patientId) => callService.getActiveCallsForPatient(patientId))
        )

        const dedupedCalls = Array.from(
          new Map(activeCallLists.flat().map((call) => [call.id, call])).values()
        )

        const latestIncomingCall = pickLatestRingingCall(dedupedCalls)
        if (isMounted) {
          debugLogger.info('Carga inicial de llamadas entrantes completada', {
            totalCalls: dedupedCalls.length,
            incomingCallId: latestIncomingCall?.callId,
          })
          setIncomingCall(latestIncomingCall)
        }
      } catch (error) {
        debugLogger.error('Fallo la carga inicial de llamadas entrantes', error)
        logger.error('[IncomingCallHandler] Failed to load active calls:', error)
      }
    }

    void loadExistingCalls()

    for (const patientId of normalizedPatientIds) {
      const unsubscribe = callService.subscribeToUserCalls(patientId, 'patient', (call) => {
        debugLogger.info('Realtime de llamada entrante recibido', {
          callId: call.id,
          status: call.status,
          patientId,
        })
        logger.info('[IncomingCallHandler] Call update received:', call)
        syncIncomingCall(call)
      })
      unsubscribers.push(unsubscribe)
    }

    return () => {
      debugLogger.info('Limpiando listener de llamadas entrantes')
      isMounted = false
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [debugLogger, normalizedPatientIds])

  const handleAccept = async () => {
    if (!incomingCall) return

    setIsConnecting(true)

    try {
      const callService = createCallService()
      debugLogger.info('Paciente acepta llamada', {
        callId: incomingCall.callId,
        roomId: incomingCall.roomId,
      })
      await callService.logDebugEvent(incomingCall.callId, 'info', 'IncomingCallHandler', 'Paciente acepta llamada', {
        roomId: incomingCall.roomId,
      })
      await callService.updateCallStatus(incomingCall.callId, 'accepted')
      router.push(`/call/${incomingCall.roomId}?callId=${incomingCall.callId}`)
    } catch (error) {
      debugLogger.error('Fallo al aceptar llamada', error, {
        callId: incomingCall.callId,
      })
      logger.error('[IncomingCallHandler] Failed to accept call:', error)
      setIsConnecting(false)
    }
  }

  const handleDecline = async () => {
    if (!incomingCall) return

    try {
      const callService = createCallService()
      debugLogger.warn('Paciente rechaza llamada', {
        callId: incomingCall.callId,
      })
      await callService.logDebugEvent(incomingCall.callId, 'warn', 'IncomingCallHandler', 'Paciente rechaza llamada')
      await callService.updateCallStatus(incomingCall.callId, 'declined', 'patient_declined')
      setIncomingCall(null)
      setIsConnecting(false)
    } catch (error) {
      debugLogger.error('Fallo al rechazar llamada', error, {
        callId: incomingCall.callId,
      })
      logger.error('[IncomingCallHandler] Failed to decline call:', error)
    }
  }

  if (!incomingCall) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-10 w-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>

          <h2 className="mb-2 text-xl font-semibold text-gray-800">Llamada entrante</h2>
          <p className="text-gray-600">{incomingCall.doctorName} te está llamando</p>
        </div>

        <div className="mb-6 flex justify-center">
          <div className="flex space-x-1">
            <div className="h-2 w-2 animate-bounce rounded-full bg-green-500"></div>
            <div
              className="h-2 w-2 animate-bounce rounded-full bg-green-500"
              style={{ animationDelay: '0.1s' }}
            ></div>
            <div
              className="h-2 w-2 animate-bounce rounded-full bg-green-500"
              style={{ animationDelay: '0.2s' }}
            ></div>
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <span>Aceptar</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-4 text-center text-xs text-gray-500">
          Llamada ID: {incomingCall.callId.slice(-8)}
        </div>
      </div>
    </div>
  )
}
