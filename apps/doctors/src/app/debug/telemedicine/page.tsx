import { TelemedicineDebugPanel } from '@autamedica/telemedicine'

interface DoctorsTelemedicineDebugPageProps {
  searchParams: Promise<{ callId?: string; roomId?: string }>
}

export default async function DoctorsTelemedicineDebugPage({
  searchParams,
}: DoctorsTelemedicineDebugPageProps) {
  const { callId, roomId } = await searchParams

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

        <TelemedicineDebugPanel
          callId={typeof callId === 'string' ? callId : undefined}
          roomId={typeof roomId === 'string' ? roomId : undefined}
          className="max-w-none"
          title="Timeline doctor"
        />
      </div>
    </main>
  )
}
