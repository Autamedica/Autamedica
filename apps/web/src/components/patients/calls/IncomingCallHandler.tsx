'use client'

import { useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@autamedica/auth'
import { createCallService } from '@autamedica/telemedicine'
import type { InviteMessage } from '@autamedica/telemedicine'
import { logger } from '@autamedica/shared'

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
}

export function IncomingCallHandler({ patientId, patientName: _patientName = 'Paciente' }: IncomingCallHandlerProps) {
  const [incomingCall, setIncomingCall] = useState<InviteMessage | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  // Singleton del servicio de llamadas — evita crear múltiples GoTrueClient
  const callServiceRef = useRef<ReturnType<typeof createCallService> | null>(null)

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

  // Request notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

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
            const inviteMessage: InviteMessage = {
              type: 'invite',
              callId: call.id,
              roomId: call.room_id,
              from: { doctorId: call.doctor_id, name: 'Doctor' },
              to: { patientId: call.patient_id }
            }
            setIncomingCall(inviteMessage)
            tryShowBrowserNotification(
              'Llamada entrante',
              `${inviteMessage.from.name || 'Tu doctor'} te esta llamando`
            )
          } else if (call.status === 'canceled') {
            setIncomingCall(null)
            setIsConnecting(false)
          }
        })

        return subscription
      } catch (error) {
        logger.error('[IncomingCallHandler] Failed to setup call listener:', error)
        return () => {}
      }
    }

    let subscription: (() => void) | null = null
    setupCallListener().then(sub => { subscription = sub })

    return () => {
      if (subscription) subscription()
    }
  }, [patientId])

  const handleAccept = async () => {
    if (!incomingCall) return

    setIsConnecting(true)

    try {
      await getCallService().updateCallStatus(incomingCall.callId, 'accepted')
      window.location.href = `/patients/call/${incomingCall.roomId}?callId=${incomingCall.callId}`
    } catch (error) {
      logger.error('[IncomingCallHandler] Failed to accept call:', error)
      setIsConnecting(false)
    }
  }

  const handleDecline = async () => {
    if (!incomingCall) return

    try {
      await getCallService().updateCallStatus(incomingCall.callId, 'declined', 'patient_declined')
      setIncomingCall(null)
    } catch (error) {
      logger.error('[IncomingCallHandler] Failed to decline call:', error)
    }
  }

  if (!incomingCall) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">

        {/* Doctor avatar/icon */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>

          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Llamada entrante
          </h2>

          <p className="text-gray-600">
            {incomingCall.from.name || 'Doctor'} te está llamando
          </p>
        </div>

        {/* Animated call indicator */}
        <div className="flex justify-center mb-6">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex space-x-3">
          <button
            onClick={handleDecline}
            disabled={isConnecting}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 px-4 rounded-lg flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Rechazar</span>
          </button>

          <button
            onClick={handleAccept}
            disabled={isConnecting}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 px-4 rounded-lg flex items-center justify-center space-x-2"
          >
            {isConnecting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>Aceptar</span>
              </>
            )}
          </button>
        </div>

        {/* Call info */}
        <div className="mt-4 text-center text-xs text-gray-500">
          Llamada ID: {incomingCall.callId.slice(-8)}
        </div>
      </div>
    </div>
  )
}
