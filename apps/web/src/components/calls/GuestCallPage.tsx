'use client'

import { useMemo, useState } from 'react'
import { UnifiedVideoCall, createCallProvider } from '@autamedica/telemedicine'
import { useGuestCallSession } from '@/hooks/calls/useGuestCallSession'

interface GuestCallPageProps {
  roomId: string
}

function CallEndedScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 text-white">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-10 text-center">
        <h1 className="text-xl font-semibold">Videollamada finalizada</h1>
        <p className="mt-3 text-sm text-neutral-400">
          Gracias por usar AutaMedica. Podes cerrar esta ventana.
        </p>
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 text-white">
      <div className="max-w-md rounded-2xl border border-red-900/50 bg-neutral-900 p-10 text-center">
        <h1 className="text-xl font-semibold text-red-400">No se pudo conectar</h1>
        <p className="mt-3 text-sm text-neutral-400">{message}</p>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 text-white">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
        <p className="mt-4 text-sm text-neutral-400">Preparando videollamada...</p>
      </div>
    </div>
  )
}

export default function GuestCallPage({ roomId }: GuestCallPageProps) {
  const [ended, setEnded] = useState(false)

  const token = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('token')
  }, [])

  const { session: callSession, loading, error } = useGuestCallSession(roomId, token)

  const callProvider = useMemo(
    () => callSession
      ? createCallProvider({
          bootstrap: callSession,
          // Guest never uses WebRTC P2P (no Supabase Realtime), always Cloudflare Calls SFU
        })
      : null,
    [callSession?.callId, callSession?.runtime],
  )

  if (ended) return <CallEndedScreen />
  if (error) return <ErrorScreen message={error} />
  if (loading || !callSession || !callProvider) return <LoadingScreen />

  return (
    <UnifiedVideoCall
      provider={callProvider}
      roomId={callSession.roomId}
      callId={callSession.callId}
      userId={callSession.user.id}
      userType={callSession.user.role}
      userName={callSession.user.displayName}
      iceServers={callSession.transport.iceServers}
      theme="patient"
      onCallEnd={() => setEnded(true)}
      autoStart
      runtime={callSession.runtime}
      className="h-screen"
    />
  )
}
