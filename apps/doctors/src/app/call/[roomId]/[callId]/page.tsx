import { redirect } from 'next/navigation'
import { CallPageClient } from '../CallPageClient'

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export default async function DoctorCallWithIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string; callId: string }>
  searchParams: Promise<{ waiting?: string; debug?: string }>
}) {
  const { roomId, callId } = await params
  const { waiting, debug } = await searchParams

  if (!callId || callId.trim() === '') {
    redirect(`/call/${roomId}`)
  }

  return (
    <CallPageClient
      roomId={roomId}
      callId={callId}
      waitForAcceptance={waiting === 'true'}
      debugEnabled={debug === '1' || debug === 'true'}
    />
  )
}
