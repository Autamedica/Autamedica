'use client'

import { useEffect, useMemo, useState } from 'react'
import { UnifiedVideoCall } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import { useConsultationContext } from '@/hooks/doctors/useConsultationContext'
import { ConsultationContextPanel } from './ConsultationContextPanel'

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
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const { context, loading: contextLoading, error: contextError } = useConsultationContext(roomId)

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

    if (typedProfile?.role !== 'doctor') {
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

  const { userId, userName } = useMemo(() => {
    if (session && typedProfile) {
      return {
        userId: (session as { user: { id: string } }).user.id,
        userName: typedProfile.firstName && typedProfile.lastName
          ? `${typedProfile.firstName} ${typedProfile.lastName}`
          : typedProfile?.email || 'Doctor'
      }
    }

    return {
      userId: '',
      userName: 'Doctor'
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
    <div className="h-screen bg-[#101d32] overflow-hidden flex">
      {/* Video Call */}
      <div className={`flex-1 min-w-0 transition-all duration-300 ${panelCollapsed ? '' : 'mr-0'}`}>
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

      {/* Clinical Context Panel */}
      <div className={`shrink-0 transition-all duration-300 ${panelCollapsed ? 'w-0' : 'w-80'}`}>
        <ConsultationContextPanel
          context={context}
          loading={contextLoading}
          error={contextError}
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed(prev => !prev)}
        />
      </div>
    </div>
  )
}
