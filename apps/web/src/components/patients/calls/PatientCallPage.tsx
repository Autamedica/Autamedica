'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UnifiedVideoCall } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'

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

  const typedProfile = profile as (UserProfile & { role?: string; email?: string }) | null

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

    if (typedProfile?.role !== 'patient') {
      window.location.href = '/'
      return
    }

    setIsReady(true)
  }, [session, loading, roomId, typedProfile])

  const handleCallEnd = useCallback(() => {
    logger.info('[PatientCallPage] Call ended, redirecting to dashboard')
    window.location.href = '/dashboard'
  }, [])

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

  if (loading || !isReady) {
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
      roomId={roomId}
      userId={userId}
      userType="patient"
      userName={userName}
      theme="patient"
      onCallEnd={handleCallEnd}
      autoStart
      className="h-screen"
    />
  )
}
