'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TelemedicineDebugPanel,
  UnifiedVideoCall,
  createTelemedicineLogger,
} from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/auth'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import { WaitingRoom } from '@/components/calls/WaitingRoom'

interface CallPageClientProps {
  roomId: string
  callId?: string
  waitForAcceptance?: boolean
  debugEnabled?: boolean
}

const REQUIRE_AUTH = false

export function CallPageClient({
  roomId,
  callId,
  waitForAcceptance = false,
  debugEnabled = false,
}: CallPageClientProps) {
  return (
    <AuthProvider onAuthStateChange={() => {}}>
      <DoctorCallContent
        roomId={roomId}
        callId={callId}
        waitForAcceptance={waitForAcceptance}
        debugEnabled={debugEnabled}
      />
    </AuthProvider>
  )
}

function DoctorCallContent({
  roomId,
  callId,
  waitForAcceptance,
  debugEnabled,
}: {
  roomId: string
  callId?: string
  waitForAcceptance: boolean
  debugEnabled: boolean
}) {
  const router = useRouter()
  const { session, profile, loading } = useAuth()
  const [isReady, setIsReady] = useState(false)
  const typedProfile = profile as UserProfile | null
  const debugLogger = useMemo(
    () => createTelemedicineLogger({
      source: 'DoctorCallPage',
      callId,
      roomId,
      userType: 'doctor',
    }),
    [callId, roomId]
  )

  useEffect(() => {
    if (loading) return

    if (!session) {
      if (REQUIRE_AUTH) {
        debugLogger.warn('No hay sesion de doctor; redirigiendo al login')
        const authOrigin = getClientEnvOrDefault(
          'NEXT_PUBLIC_APP_URL',
          process.env.NODE_ENV === 'production'
            ? 'https://www.autamedica.com'
            : 'http://localhost:3000'
        )
        const loginUrl = new URL('/auth/login', authOrigin)
        loginUrl.searchParams.set('portal', 'doctors')
        const callPath = callId ? `/call/${roomId}/${callId}` : `/call/${roomId}`
        loginUrl.searchParams.set('returnTo', `${window.location.origin}${callPath}`)
        window.location.href = loginUrl.toString()
      } else {
        debugLogger.warn('Sin sesion; usando identidad de desarrollo')
        logger.warn('[UnifiedVideoCall][doctor] sin sesión; usando identidad de desarrollo')
        setIsReady(true)
      }
      return
    }

    if (typedProfile?.role !== 'doctor') {
      debugLogger.warn('Sesion cargada pero el rol no es doctor', {
        role: typedProfile?.role,
      })
      router.push('/')
      return
    }

    debugLogger.info('Sesion de doctor validada; pantalla lista')
    setIsReady(true)
  }, [callId, debugLogger, session, loading, router, roomId, typedProfile])

  const handleCallEnd = () => {
    router.push('/appointments')
  }

  const handleCallStart = () => {
    // logger.info('[UnifiedVideoCall][doctor] start')
  }

  const _handleStatusChange = (_status: string) => {
    // logger.info('[UnifiedVideoCall][doctor] status:', status)
  }

  const _handleError = (error: unknown) => {
    logger.error('[UnifiedVideoCall][doctor] error:', error)
  }

  const { userId, userName } = useMemo(() => {
    if (session && typedProfile) {
      return {
        userId: session.user.id,
        userName: [typedProfile.first_name, typedProfile.last_name].filter(Boolean).join(' ').trim()
          || typedProfile.email
          || 'Doctor'
      }
    }

    return {
      userId: `dev-doctor-${roomId}`,
      userName: 'Doctor de prueba'
    }
  }, [session, typedProfile, roomId])

  if (loading || !isReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ee58a6] mx-auto mb-4"></div>
          <p className="text-white">Preparando videollamada...</p>
        </div>
      </div>
    )
  }

  if (waitForAcceptance && callId) {
    return <WaitingRoom callId={callId} doctorId={userId} roomId={roomId} debugEnabled={debugEnabled} />
  }



  return (
    <div className="min-h-screen bg-slate-100 overflow-hidden">
      <UnifiedVideoCall
        roomId={roomId}
        callId={callId}
        autoStart={Boolean(callId)}
        userId={userId}
        userType="doctor"
        userName={userName}
        cloudflareCallsApiUrl="/api/cloudflare-calls"
        theme="doctor"
        onCallEnd={handleCallEnd}
        onCallStart={handleCallStart}
        className="h-screen"
      />

      {debugEnabled && (
        <TelemedicineDebugPanel
          callId={callId}
          roomId={roomId}
          className="fixed bottom-4 left-4 z-50"
          title="Timeline doctor"
          initiallyOpen={false}
          compact
        />
      )}
    </div>
  )
}
