'use client'

export const dynamic = 'force-dynamic'

import NextDynamic from 'next/dynamic'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const TelemedicineDebugPanel = NextDynamic(
  () => import('@autamedica/telemedicine').then((m) => ({ default: m.TelemedicineDebugPanel })),
  { ssr: false },
)

function DebugContent() {
  const searchParams = useSearchParams()
  const callId = searchParams.get('callId') ?? undefined
  const roomId = searchParams.get('roomId') ?? undefined

  return (
    <TelemedicineDebugPanel
      callId={callId}
      roomId={roomId}
      className="max-w-none"
      title="Timeline paciente"
    />
  )
}

export default function PatientsTelemedicineDebugPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Telemedicina
          </p>
          <h1 className="text-3xl font-semibold text-white">Debug de llamadas</h1>
          <p className="text-sm text-slate-400">
            Revise logs locales y persistidos. Puede filtrar con <code>?callId=...</code> o{' '}
            <code>?roomId=...</code>.
          </p>
        </header>

        <Suspense fallback={null}>
          <DebugContent />
        </Suspense>
      </div>
    </main>
  )
}
