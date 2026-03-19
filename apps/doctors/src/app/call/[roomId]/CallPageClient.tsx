'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UnifiedVideoCall } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/auth'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'

interface CallPageClientProps {
  roomId: string
}

const REQUIRE_AUTH = false

export function CallPageClient({ roomId }: CallPageClientProps) {
  return (
    <AuthProvider onAuthStateChange={() => {}}>
      <DoctorCallContent roomId={roomId} />
    </AuthProvider>
  )
}

function DoctorCallContent({ roomId }: { roomId: string }) {
  const router = useRouter()
  const { session, profile, loading } = useAuth()
  const [isReady, setIsReady] = useState(false)

  const typedProfile = profile as UserProfile | null

  useEffect(() => {
    if (loading) return

    if (!session) {
      if (REQUIRE_AUTH) {
        const authOrigin = getClientEnvOrDefault(
          'NEXT_PUBLIC_APP_URL',
          process.env.NODE_ENV === 'production'
            ? 'https://www.autamedica.com'
            : 'http://localhost:3000'
        )
        const loginUrl = new URL('/auth/login', authOrigin)
        loginUrl.searchParams.set('portal', 'doctors')
        loginUrl.searchParams.set('returnTo', `${window.location.origin}/call/${roomId}`)
        window.location.href = loginUrl.toString()
      } else {
        logger.warn('[UnifiedVideoCall][doctor] sin sesión; usando identidad de desarrollo')
        setIsReady(true)
      }
      return
    }

    if (typedProfile?.role !== 'doctor') {
      router.push('/')
      return
    }

    setIsReady(true)
  }, [session, loading, router, roomId, typedProfile])

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



  return (
    <div className="min-h-screen bg-slate-100 overflow-hidden">
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
