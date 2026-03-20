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
  return (
    <CallPageClient
      roomId={roomId}
      callId={typeof callId === 'string' ? callId : undefined}
      debugEnabled={debug === '1' || debug === 'true'}
    />
  )
}
