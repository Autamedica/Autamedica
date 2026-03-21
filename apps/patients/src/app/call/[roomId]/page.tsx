import { redirect } from 'next/navigation'
import { CallPageClient } from './CallPageClient'

export const dynamic = 'force-dynamic'
export const dynamicParams = true

interface PatientCallPageProps {
  params: Promise<{ roomId: string }>
  searchParams: Promise<{ callId?: string; debug?: string }>
}

export default async function PatientCallPage({ params, searchParams }: PatientCallPageProps) {
  const { roomId } = await params
  const { callId, debug } = await searchParams

  // Redirigir a URL determinista: /call/[roomId]/[callId]
  if (typeof callId === 'string' && callId.trim() !== '') {
    const target = `/call/${roomId}/${callId}${debug ? `?debug=${debug}` : ''}`
    redirect(target)
  }

  // Sin callId: flujo libre (test-call manual sin turno asociado)
  return (
    <CallPageClient
      roomId={roomId}
      callId={undefined}
      debugEnabled={debug === '1' || debug === 'true'}
    />
  )
}
