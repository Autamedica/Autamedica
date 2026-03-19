'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UnifiedVideoCall } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import { PatientPortalShell } from '@/components/layout/PatientPortalShell'

interface CallPageClientProps {
  roomId: string
}

const REQUIRE_AUTH = getClientEnvOrDefault('NEXT_PUBLIC_REQUIRE_AUTH', 'false') === 'true'

export function CallPageClient({ roomId }: CallPageClientProps) {
  return (
    <AuthProvider>
      <PatientCallContent roomId={roomId} />
    </AuthProvider>
  )
}

function PatientCallContent({ roomId }: { roomId: string }) {
  const router = useRouter()
  const { session, loading } = useAuth()
  const [isReady, setIsReady] = useState(false)

  // Handlers and memoized values BEFORE early returns (React hooks rules)
  const handleCallEnd = () => {
    router.push('/appointments')
  }

  const handleCallStart = () => {
    // logger.info('[UnifiedVideoCall][patient] start')
  }

  const handleStatusChange = (_status: string) => {
    // logger.info('[UnifiedVideoCall][patient] status:', status)
  }

  const handleError = (error: unknown) => {
    logger.error('[UnifiedVideoCall][patient] error:', error)
  }

  const { userId, userName } = useMemo(() => {
    if (session) {
      return {
        userId: session.user.id,
        userName: session.user.email || 'Paciente'
      }
    }

    return {
      userId: `dev-patient-${roomId}`,
      userName: 'Paciente de prueba'
    }
  }, [session, roomId])

  useEffect(() => {
    if (loading) return

    if (!session) {
      if (REQUIRE_AUTH) {
        const defaultAuthOrigin = window.location.hostname === 'localhost'
          ? 'http://localhost:3000'
          : 'https://www.autamedica.com'
        const authOrigin = getClientEnvOrDefault(
          'NEXT_PUBLIC_APP_URL',
          defaultAuthOrigin
        )
        const loginUrl = new URL('/auth/login', authOrigin)
        loginUrl.searchParams.set('portal', 'patients')
        loginUrl.searchParams.set('returnTo', `${window.location.origin}/call/${roomId}`)
        window.location.href = loginUrl.toString()
      } else {
        logger.warn('[UnifiedVideoCall][patient] sin sesión; usando identidad de desarrollo')
        setIsReady(true)
      }
      return
    }

    if (session.user.role !== 'patient') {
      router.push('/')
      return
    }

    setIsReady(true)
  }, [session, loading, router, roomId])

  if (loading || !isReady) {
    return (
      <PatientPortalShell
        title="Preparando consulta"
        subtitle="Estamos asegurando la sesión, tus permisos y la sala antes de iniciar."
        modeLabel="Modo inmersivo"
        backHref="/appointments"
      >
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-300"></div>
            <p className="text-white">Preparando videollamada...</p>
          </div>
        </div>
      </PatientPortalShell>
    )
  }

  return (
    <PatientPortalShell
      title="Consulta en vivo"
      subtitle="Sala segura para videollamada, seguimiento clínico y coordinación con tu equipo médico."
      modeLabel="Telemedicina"
      backHref="/appointments"
    >
      <UnifiedVideoCall
        roomId={roomId}
        userId={userId}
        userType="patient"
        userName={userName}
        theme="patient"
        onCallEnd={handleCallEnd}
        onCallStart={handleCallStart}
        onStatusChange={handleStatusChange}
        onError={handleError}
        className="h-full"
      />
    </PatientPortalShell>
  )
}
