'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserClient } from '@autamedica/auth'
import { UnifiedVideoCall, createCallService, useTurnCredentials } from '@autamedica/telemedicine'
import type { CallStatus } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import { useCallSession } from '@/hooks/calls/useCallSession'
import { translateCallError } from '@/lib/calls/lib/call-error-messages'
import { persistCallStatusBrowserService } from '@/lib/calls/services/persist-call-status.browser'
import { respondCallBrowserService } from '@/lib/calls/services/respond-call.browser'

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

  // Client-side TURN fallback — if bootstrap didn't include TURN, fetch from API
  const { iceServers: clientTurnServers } = useTurnCredentials('/api/patients/turn-credentials')

  const callServiceRef = useRef<ReturnType<typeof createCallService> | null>(null)

  const typedProfile = profile as (UserProfile & { role?: string; email?: string }) | null
  const getCallService = useCallback(() => {
    if (!callServiceRef.current) {
      callServiceRef.current = createCallService(createBrowserClient())
    }

    return callServiceRef.current
  }, [])
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

  // Auto-accept the call when patient enters the room directly via URL
  // This covers the case where the patient navigates to the call URL without
  // going through IncomingCallHandler's accept flow
  useEffect(() => {
    if (!callSession?.callId) return
    const callId = callSession.callId
    respondCallBrowserService
      .respond({ callId, action: 'accept' })
      .catch((err: unknown) => {
        logger.warn('[PatientCallPage] Auto-accept failed (may already be accepted)', err)
      })
  }, [callSession?.callId])

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

      try {
        await persistCallStatusBrowserService.persist(callSession.callId, {
          status,
          ...(reason ? { reason } : {}),
        })
      } catch (err) {
        logger.warn('[PatientCallPage] Failed to persist call status', { status, error: err })
      }
    },
    [callSession]
  )

  const { userId, userName } = useMemo(() => {
    if (session && typedProfile) {
      return {
        userId: (session as { user: { id: string } }).user.id,
        userName: typedProfile.firstName && typedProfile.lastName
          ? `${typedProfile.firstName} ${typedProfile.lastName}`
          : 'Paciente'
      }
    }
    return { userId: '', userName: 'Paciente' }
  }, [session, typedProfile])

  if (callSessionError) {
    const errorInfo = translateCallError(callSessionError)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Telemedicina paciente
          </p>
          <div className="mx-auto mb-4 mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
            <svg className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">{errorInfo.title}</h1>
          <p className="mt-3 text-sm text-slate-300">{errorInfo.description}</p>
          {errorInfo.retryHint && (
            <p className="mt-2 text-sm text-amber-400">{errorInfo.retryHint}</p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void refreshCallSession()}
              className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/patients' }}
              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/5"
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
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Telemedicina paciente
          </p>
          <div className="mx-auto mb-4 mt-5 h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-400"></div>
          <h1 className="text-xl font-semibold text-white">Preparando videollamada...</h1>
          <p className="mt-3 text-sm text-slate-300">
            Estamos validando tu acceso y la conexión segura para entrar a la consulta.
          </p>
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
      iceServers={clientTurnServers ?? callSession.transport.iceServers}
      cloudflareCallsApiUrl={
        callSession.runtime === 'webrtc-p2p'
          ? null
          : (callSession.transport.cloudflareCallsApiUrl ?? null)
      }
      supabase={callSession.runtime === 'webrtc-p2p' ? createBrowserClient() : undefined}
      theme="patient"
      onCallEnd={handleCallEnd}
      persistCallStatus={handlePersistCallStatus}
      callService={getCallService()}
      supabaseUrl={import.meta.env.PUBLIC_SUPABASE_URL}
      supabaseAnonKey={import.meta.env.PUBLIC_SUPABASE_ANON_KEY}
      autoStart
      className="h-screen"
    />
  )
}
