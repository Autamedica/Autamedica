import { CallPageClient } from './CallPageClient'

// Deshabilitar SSG para esta ruta - requiere runtime dinámico
export const dynamic = 'force-dynamic'
export const dynamicParams = true

export default async function DoctorCallPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  return <CallPageClient roomId={roomId} />
}
