'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCallService, createTelemedicineLogger } from '@autamedica/telemedicine'
import { logger } from '@autamedica/shared'

interface StartCallButtonProps {
  doctorId: string
  patientId: string
  patientName?: string
  className?: string
}

export function StartCallButton({
  doctorId,
  patientId,
  patientName = 'Paciente',
  className = "bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
}: StartCallButtonProps) {
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const debugLogger = createTelemedicineLogger({
    source: 'DoctorStartCall',
    roomId: undefined,
    userId: doctorId,
    userType: 'doctor',
  })

  const handleStartCall = async () => {
    setIsStarting(true)
    setError(null)

    try {
      if (!doctorId || !patientId) {
        debugLogger.error('No hay ids validos para iniciar la llamada', undefined, {
          doctorId,
          patientId,
        })
        throw new Error('No hay un paciente valido seleccionado para iniciar la llamada.')
      }

      debugLogger.info('Iniciando flujo de llamada', { doctorId, patientId })

      const callService = createCallService()

      // Idempotencia: si ya existe una llamada activa para este paciente, reutilizarla
      const activeCalls = await callService.getActiveCallsForDoctor(doctorId)
      const existingCall = activeCalls.find((c) => c.patient_id === patientId)
      if (existingCall) {
        debugLogger.info('Llamada activa encontrada; reutilizando', {
          callId: existingCall.id,
          roomId: existingCall.room_id,
          status: existingCall.status,
        })
        router.push(`/call/${existingCall.room_id}/${existingCall.id}?waiting=true`)
        return
      }

      const call = await callService.createCall(doctorId, patientId)
      debugLogger.info('Registro de llamada creado', { callId: call.id, roomId: call.room_id })
      await callService.logDebugEvent(call.id, 'info', 'DoctorStartCall', 'Registro de llamada creado', {
        doctorId,
        patientId,
        roomId: call.room_id,
      })

      await callService.updateCallStatus(call.id, 'ringing')
      debugLogger.info('Llamada en estado ringing; redirigiendo a sala de espera', {
        callId: call.id,
        roomId: call.room_id,
      })
      await callService.logDebugEvent(call.id, 'info', 'DoctorStartCall', 'Llamada enviada a sala de espera', {
        roomId: call.room_id,
      })

      router.push(`/call/${call.room_id}/${call.id}?waiting=true`)

    } catch (err: unknown) {
      debugLogger.error('Fallo el inicio de la llamada', err, {
        doctorId,
        patientId,
      })
      logger.error('Failed to start call - detailed error:', err)
      if (err instanceof Error) {
        logger.error('Error name:', err.constructor.name)
        logger.error('Error message:', err.message)
        logger.error('Error stack:', err.stack)
      }

      let errorMessage = 'Error al iniciar la llamada'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        errorMessage = JSON.stringify(err)
      }

      setError(errorMessage)
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleStartCall}
        disabled={isStarting}
        className={`${className} ${isStarting ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isStarting ? (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Conectando...</span>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span>Llamar a {patientName}</span>
          </div>
        )}
      </button>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
          {error}
        </div>
      )}
    </div>
  )
}
