'use client'

import { useEffect, useState } from 'react'
import { createCallService } from '@autamedica/telemedicine'
import type { Call } from '@autamedica/telemedicine'
import { createBrowserClient } from '@autamedica/auth'
import { logger } from '@autamedica/shared'
import { useConsultationContext } from '@/hooks/doctors/useConsultationContext'

interface WaitingRoomProps {
  callId: string
  doctorId: string
  roomId: string
}

type WaitingState = 'ringing' | 'accepted' | 'declined' | 'canceled' | 'timeout'

export function WaitingRoom({ callId, doctorId, roomId }: WaitingRoomProps) {
  const [state, setState] = useState<WaitingState>('ringing')
  const [timeLeft, setTimeLeft] = useState(45) // 45 seconds timeout
  const [_call, setCall] = useState<Call | null>(null)
  const { context, loading: contextLoading } = useConsultationContext(roomId)

  useEffect(() => {
    const callService = createCallService(createBrowserClient())
    let timeoutTimer: NodeJS.Timeout

    // Load call details and setup realtime subscription
    const setupCall = async () => {
      try {
        // Load initial call data
        const callData = await callService.getCall(callId)
        setCall(callData)

        // If call is already accepted/declined, update state immediately
        if (callData?.status === 'accepted') {
          setState('accepted')
          setTimeout(() => {
            window.location.href = `/doctors/call/${roomId}/${callId}`
          }, 1000)
          return
        } else if (callData?.status === 'declined') {
          setState('declined')
          return
        }

        // Subscribe to realtime changes on this specific call
        const subscription = callService.subscribeToCall(callId, (updatedCall) => {
          // logger.info('[WaitingRoom] Call status changed:', updatedCall.status)
          setCall(updatedCall)

          switch (updatedCall.status) {
            case 'accepted':
              setState('accepted')
              // Navigate to call room
              setTimeout(() => {
                window.location.href = `/doctors/call/${roomId}/${callId}`
              }, 1000)
              break
            case 'declined':
              setState('declined')
              break
            case 'canceled':
              setState('canceled')
              break
          }
        })

        // Setup timeout timer
        timeoutTimer = setInterval(() => {
          setTimeLeft(prev => {
            if (prev <= 1) {
              setState('timeout')
              // Cancel call due to timeout
              callService.updateCallStatus(callId, 'canceled', 'timeout').catch((err) => logger.error('Error canceling call:', err))
              return 0
            }
            return prev - 1
          })
        }, 1000)

        return subscription
      } catch (error) {
        logger.error('Failed to setup call:', error)
        setState('canceled')
        return null
      }
    }

    let subscription: (() => void) | null = null
    setupCall().then(sub => { subscription = sub })

    // Cleanup
    return () => {
      if (timeoutTimer) clearInterval(timeoutTimer)
      if (subscription) subscription()
    }
  }, [callId, doctorId, roomId])

  const handleCancel = async () => {
    try {
      const callService = createCallService(createBrowserClient())
      await callService.updateCallStatus(callId, 'canceled', 'doctor_canceled')

      // The realtime subscription will handle UI updates
      window.history.back()
    } catch (error) {
      logger.error('Failed to cancel call:', error)
    }
  }

  const getStateText = () => {
    switch (state) {
      case 'ringing':
        return `Llamando al paciente... (${timeLeft}s)`
      case 'accepted':
        return 'Paciente aceptó la llamada. Conectando...'
      case 'declined':
        return 'El paciente rechazó la llamada'
      case 'canceled':
        return 'Llamada cancelada'
      case 'timeout':
        return 'El paciente no respondió'
      default:
        return 'Conectando...'
    }
  }

  const getStateColor = () => {
    switch (state) {
      case 'ringing':
        return 'text-am-doctor-600'
      case 'accepted':
        return 'text-green-600'
      case 'declined':
      case 'canceled':
      case 'timeout':
        return 'text-red-600'
      default:
        return 'text-am-surface-600'
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-am-surface-50 p-6">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">

        {/* Animated call icon */}
        <div className="mb-6">
          {state === 'ringing' ? (
            <div className="w-16 h-16 mx-auto bg-am-doctor-100 rounded-full flex items-center justify-center animate-pulse">
              <svg className="w-8 h-8 text-am-doctor-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
          ) : state === 'accepted' ? (
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        {/* Status text */}
        <h2 className={`text-lg font-semibold mb-4 ${getStateColor()}`}>
          {getStateText()}
        </h2>

        {/* Progress bar for timeout */}
        {state === 'ringing' && (
          <div className="w-full bg-am-surface-200 rounded-full h-2 mb-6">
            <div
              className="bg-am-doctor-600 h-2 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(timeLeft / 45) * 100}%` }}
            />
          </div>
        )}

        {/* Clinical context */}
        {!contextLoading && context && (
          <div className="text-left bg-slate-50 rounded-lg p-4 mb-4 space-y-2">
            {context.patient && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Paciente</span>
                <p className="text-sm font-medium text-slate-800">{context.patient.name}</p>
              </div>
            )}
            {context.summary?.headline && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Motivo</span>
                <p className="text-sm text-slate-700">{context.summary.headline}</p>
              </div>
            )}
            {context.suggestedQuestions && context.suggestedQuestions.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Preguntas sugeridas</span>
                <ul className="mt-1 space-y-1">
                  {context.suggestedQuestions.slice(0, 3).map((q, i) => (
                    <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                      <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                        q.priority === 'critical' ? 'bg-red-400' :
                        q.priority === 'high' ? 'bg-orange-400' : 'bg-am-doctor-400'
                      }`} />
                      {q.question}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {state === 'ringing' && (
            <button
              onClick={handleCancel}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg"
            >
              Cancelar llamada
            </button>
          )}

          {(state === 'declined' || state === 'timeout' || state === 'canceled') && (
            <button
              onClick={() => window.history.back()}
              className="w-full bg-am-surface-600 hover:bg-am-surface-700 text-white py-2 px-4 rounded-lg"
            >
              Volver
            </button>
          )}
        </div>
      </div>
    </div>
  )
}