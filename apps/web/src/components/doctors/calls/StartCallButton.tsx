'use client'

import { useStartCall } from '@/hooks/doctors/useStartCall'

interface StartCallButtonProps {
  doctorId: string
  patientId: string
  patientName?: string
  appointmentId?: string
  className?: string
}

export function StartCallButton({
  doctorId,
  patientId,
  patientName = 'Paciente',
  appointmentId,
  className = "bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
}: StartCallButtonProps) {
  const { startCall, isStarting, error } = useStartCall({ doctorId, patientId, appointmentId })
  const hasDoctor = doctorId.trim().length > 0
  const hasPatient = patientId.trim().length > 0

  return (
    <div className="space-y-2">
      <button
        onClick={startCall}
        disabled={isStarting || !hasDoctor || !hasPatient}
        className={`${className} ${isStarting || !hasDoctor || !hasPatient ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isStarting ? (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Conectando...</span>
          </div>
        ) : !hasDoctor ? (
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
            <span>Perfil médico incompleto</span>
          </div>
        ) : !hasPatient ? (
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
            <span>Selecciona un paciente</span>
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
