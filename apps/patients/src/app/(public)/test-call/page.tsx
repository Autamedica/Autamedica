'use client'

import { useState } from 'react'
import { logger } from '@autamedica/shared'
import { UnifiedVideoCall } from '@autamedica/telemedicine'

export default function TestCallPage() {
  const [roomId, setRoomId] = useState('test-room-001')
  const [userId] = useState('patient-test-001')
  const [callStarted, setCallStarted] = useState(false)
  if (callStarted) {
    return (
      <div className="h-screen w-screen">
        <UnifiedVideoCall
          roomId={roomId}
          userId={userId}
          userType="patient"
          userName="Paciente Test"
          onCallEnd={() => setCallStarted(false)}
          onCallStart={() => logger.info('Conectado a consulta medica')}
          theme="patient"
          className="h-full w-full"
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100">
            <svg className="h-8 w-8 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Unirse a Consulta</h1>
          <p className="mt-1 text-sm text-slate-500">Portal Pacientes</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Codigo de Consulta</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Ej: test-room-001"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">User ID (Paciente)</label>
              <input
                type="text"
                value={userId}
                disabled
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
              />
            </div>
          </div>

          <div className="mb-6 rounded-lg bg-sky-50 p-4">
            <h3 className="mb-2 text-sm font-medium text-sky-900">Instrucciones</h3>
            <ol className="space-y-1 text-sm text-sky-700">
              <li>1. El doctor debe haber iniciado la consulta</li>
              <li>2. Usa el mismo codigo que te proporciono el doctor</li>
              <li>3. Click &quot;Unirse&quot; para conectar</li>
              <li>4. Permite acceso a camara y microfono</li>
            </ol>
            <p className="mt-3 text-xs text-sky-800/80">
              En pruebas automatizadas, el navegador puede mostrar un video sintetico verde. Es normal.
            </p>
          </div>

          <button
            onClick={() => setCallStarted(true)}
            className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
          >
            Unirse a Consulta
          </button>
        </div>
      </div>
    </div>
  )
}
