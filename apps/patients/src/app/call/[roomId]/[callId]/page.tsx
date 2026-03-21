import { redirect } from 'next/navigation'
import { CallPageClient } from '../CallPageClient'

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export default async function PatientCallWithIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string; callId: string }>
  searchParams: Promise<{ debug?: string }>
}) {
  const { roomId, callId } = await params
  const { debug } = await searchParams

  if (!callId || callId.trim() === '') {
    redirect(`/call/${roomId}`)
  }

  return (
    <CallPageClient
      roomId={roomId}
      callId={callId}
      debugEnabled={debug === '1' || debug === 'true'}
    />
  )
}
