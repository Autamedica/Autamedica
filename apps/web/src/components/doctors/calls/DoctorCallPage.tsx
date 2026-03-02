'use client'

import { useEffect, useMemo, useState } from 'react'
import { UnifiedVideoCall } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'

interface DoctorCallPageProps {
  roomId: string
}

const REQUIRE_AUTH = false

export default function DoctorCallPage({ roomId }: DoctorCallPageProps) {
  return (
    <AuthProvider onAuthStateChange={() => {}}>
      <DoctorCallContent roomId={roomId} />
    </AuthProvider>
  )
}

function DoctorCallContent({ roomId }: { roomId: string }) {
  const { session, profile, loading } = useAuth()
  const [isReady, setIsReady] = useState(false)

  // Type guard to ensure profile is properly typed
  const typedProfile = profile as (UserProfile & { role?: string; email?: string }) | null

  useEffect(() => {
    if (loading) return

    if (!session) {
      if (REQUIRE_AUTH) {
        const authOrigin = getClientEnvOrDefault(
          'PUBLIC_APP_URL',
          import.meta.env.MODE === 'production'
            ? 'https://www.autamedica.com'
            : 'http://localhost:3000'
        )
        const loginUrl = new URL('/auth/login', authOrigin)
        loginUrl.searchParams.set('portal', 'doctors')
        loginUrl.searchParams.set('returnTo', `${window.location.origin}/doctors/call/${roomId}`)
        window.location.href = loginUrl.toString()
      } else {
        logger.warn('[UnifiedVideoCall][doctor] sin sesión; usando identidad de desarrollo')
        setIsReady(true)
      }
      return
    }

    if ((typedProfile as any)?.role !== 'doctor') {
      window.location.href = '/'
      return
    }

    setIsReady(true)
  }, [session, loading, roomId, typedProfile])

  const handleCallEnd = () => {
    window.location.href = '/doctors/schedule'
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
        userId: (session as any).user.id,
        userName: typedProfile.firstName && typedProfile.lastName
          ? `${typedProfile.firstName} ${typedProfile.lastName}`
          : (typedProfile as any).email || 'Doctor'
      }
    }

    return {
      userId: `dev-doctor-${roomId}`,
      userName: 'Doctor de prueba'
    }
  }, [session, typedProfile, roomId])

  if (loading || !isReady) {
    return (
      <div className="min-h-screen bg-[#101d32] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ee58a6] mx-auto mb-4"></div>
          <p className="text-white">Preparando videollamada...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#101d32] overflow-hidden">
      <UnifiedVideoCall
        roomId={roomId}
        userId={userId}
        userType="doctor"
        userName={userName}
        theme="doctor"
        onCallEnd={handleCallEnd}
        onCallStart={handleCallStart}
        className="h-screen"
      />
    </div>
  )
}
