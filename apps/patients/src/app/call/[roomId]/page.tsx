import { CallPageClient } from './CallPageClient'

export const dynamicParams = false

export function generateStaticParams() {
  return [{ roomId: 'test123' }]
}

interface PatientCallPageProps {
  params: Promise<{ roomId: string }>
}

export default async function PatientCallPage({ params }: PatientCallPageProps) {
  const { roomId } = await params
  return <CallPageClient roomId={roomId} />
}
