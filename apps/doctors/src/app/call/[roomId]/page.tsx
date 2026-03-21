import { redirect } from 'next/navigation'
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

  // Redirigir a URL determinista: /call/[roomId]/[callId]
  if (typeof callId === 'string' && callId.trim() !== '') {
    const target = `/call/${roomId}/${callId}${waiting === 'true' ? '?waiting=true' : ''}${debug ? `${waiting === 'true' ? '&' : '?'}debug=${debug}` : ''}`
    redirect(target)
  }

  // Sin callId: flujo libre (test-call manual sin turno asociado)
  return (
    <CallPageClient
      roomId={roomId}
      callId={undefined}
      waitForAcceptance={false}
      debugEnabled={debug === '1' || debug === 'true'}
    />
  )
}
