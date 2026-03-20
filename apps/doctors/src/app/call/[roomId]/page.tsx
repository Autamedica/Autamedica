import { CallPageClient } from './CallPageClient'

// Deshabilitar SSG para esta ruta - requiere runtime dinámico
export const dynamic = 'force-dynamic'
export const dynamicParams = true

export default async function DoctorCallPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>
  searchParams: Promise<{ callId?: string; waiting?: string; debug?: string }>
}) {
  const { roomId } = await params
  const { callId, waiting, debug } = await searchParams

  return (
    <CallPageClient
      roomId={roomId}
      callId={typeof callId === 'string' ? callId : undefined}
      waitForAcceptance={waiting === 'true'}
      debugEnabled={debug === '1' || debug === 'true'}
    />
  )
}
