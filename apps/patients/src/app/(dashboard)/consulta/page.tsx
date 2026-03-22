'use client'

import { useEffect, useMemo, useState } from 'react'
import { UnifiedVideoCall } from '@autamedica/telemedicine'
import { usePatientSession } from '@/hooks/usePatientSession'

export default function ConsultaPage() {
  const { user, profile } = usePatientSession()
  const [guestId, setGuestId] = useState<string | null>(null)

  useEffect(() => {
    if (user?.id) return
    const storageKey = 'autamedica-patient-signaling-id'
    const cached = window.sessionStorage.getItem(storageKey)
    if (cached) {
      setGuestId(cached)
      return
    }
    const generated = crypto.randomUUID()
    window.sessionStorage.setItem(storageKey, generated)
    setGuestId(generated)
  }, [user?.id])

  const userId = user?.id ?? guestId

  const userName = useMemo(() => {
    if (profile) {
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()
      return name || user?.email || 'Paciente'
    }
    return 'Paciente de prueba'
  }, [profile, user?.email])

  const roomId = userId ? `patient-${userId.slice(0, 8)}` : null

  if (!userId || !roomId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900">
      <UnifiedVideoCall
        roomId={roomId}
        userId={userId}
        userType="patient"
        userName={userName}
        theme="patient"
        className="h-full w-full"
      />
    </div>
  )
}
