'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UnifiedVideoCall } from '@autamedica/telemedicine'
import type { CallStatus } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import { useCallSession } from '@/hooks/calls/useCallSession'
import { persistCallStatusBrowserService } from '@/lib/calls/services/persist-call-status.browser'

interface PatientCallPageProps {
  roomId: string
}

export default function PatientCallPage({ roomId }: PatientCallPageProps) {
  return (
    <AuthProvider onAuthStateChange={() => {}}>
      <PatientCallContent roomId={roomId} />
    </AuthProvider>
  )
}

function PatientCallContent({ roomId }: { roomId: string }) {
  const { session, profile, loading } = useAuth()
  const [isReady, setIsReady] = useState(false)
  const {
    session: callSession,
    loading: callSessionLoading,
    error: callSessionError,
    refresh: refreshCallSession,
  } = useCallSession(roomId, isReady)

  const typedProfile = profile as (UserProfile & { role?: string; email?: string }) | null
  const effectiveRole = useMemo(() => {
    if (typeof typedProfile?.role === 'string' && typedProfile.role.length > 0) {
      return typedProfile.role
    }

    const sessionUser = session?.user
    if (typeof sessionUser?.user_metadata?.role === 'string' && sessionUser.user_metadata.role.length > 0) {
      return sessionUser.user_metadata.role
    }

    if (typeof sessionUser?.app_metadata?.role === 'string' && sessionUser.app_metadata.role.length > 0) {
      return sessionUser.app_metadata.role
    }

    return null
  }, [session?.user, typedProfile?.role])

  useEffect(() => {
    if (loading) return

    if (!session) {
      const authOrigin = getClientEnvOrDefault(
        'PUBLIC_APP_URL',
        import.meta.env.MODE === 'production'
          ? 'https://www.autamedica.com'
          : 'http://localhost:3000'
      )
      const loginUrl = new URL('/auth/login', authOrigin)
      loginUrl.searchParams.set('portal', 'patients')
      loginUrl.searchParams.set('returnTo', `${window.location.origin}/patients/call/${roomId}`)
      window.location.href = loginUrl.toString()
      return
    }

    if (effectiveRole && effectiveRole !== 'patient') {
      window.location.href = '/'
      return
    }

    setIsReady(true)
  }, [effectiveRole, session, loading, roomId])

  const handleCallEnd = useCallback(() => {
    logger.info('[PatientCallPage] Call ended, redirecting to dashboard')
    window.location.href = '/dashboard'
  }, [])

  const handlePersistCallStatus = useCallback(
    async (status: CallStatus, reason?: string) => {
      if (!callSession) {
        return
      }

      if (status !== 'connecting' && status !== 'connected' && status !== 'ended') {
        return
      }

      await persistCallStatusBrowserService.persist(callSession.callId, {
        status,
        ...(reason ? { reason } : {}),
      })
    },
    [callSession]
  )

  const { userId, userName } = useMemo(() => {
    if (session && typedProfile) {
      return {
        userId: (session as { user: { id: string } }).user.id,
        userName: typedProfile.firstName && typedProfile.lastName
          ? `${typedProfile.firstName} ${typedProfile.lastName}`
          : typedProfile?.email || 'Paciente'
      }
    }
    return { userId: '', userName: 'Paciente' }
  }, [session, typedProfile])

  if (callSessionError) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">No pudimos preparar la videollamada</h1>
          <p className="mt-3 text-sm text-slate-300">{callSessionError}</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void refreshCallSession()}
              className="rounded-lg bg-green-500 px-4 py-3 text-sm font-semibold text-white"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/dashboard' }}
              className="rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200"
            >
              Volver al panel
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading || !isReady || callSessionLoading || !callSession) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-white">Preparando videollamada...</p>
        </div>
      </div>
    )
  }

  return (
    <UnifiedVideoCall
      roomId={callSession.roomId}
      callId={callSession.callId}
      userId={callSession.user.id || userId}
      userType={callSession.user.role}
      userName={callSession.user.displayName || userName}
      iceServers={callSession.transport.iceServers}
      cloudflareCallsApiUrl={
        callSession.runtime === 'webrtc-p2p'
          ? null
          : (callSession.transport.cloudflareCallsApiUrl ?? null)
      }
      theme="patient"
      onCallEnd={handleCallEnd}
      persistCallStatus={handlePersistCallStatus}
      autoStart
      className="h-screen"
    />
  )
}
