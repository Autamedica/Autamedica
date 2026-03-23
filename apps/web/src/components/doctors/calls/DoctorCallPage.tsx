'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UnifiedVideoCall, useAudioTranscription } from '@autamedica/telemedicine'
import type { TranscriptSegment } from '@autamedica/telemedicine'
import { AuthProvider, useAuth } from '@autamedica/auth/react'
import type { UserProfile } from '@autamedica/types'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import { useConsultationContext } from '@/hooks/doctors/useConsultationContext'
import { ConsultationContextPanel } from './ConsultationContextPanel'

interface DoctorCallPageProps {
  roomId: string
}

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

  // Transcription — mandatory, automatic, silent
  const [transcriptionState, transcriptionActions] = useAudioTranscription('es-AR')
  const callStartTimeRef = useRef<number | null>(null)
  const transcriptionSavedRef = useRef(false)
  const transcriptionStartedRef = useRef(false)

  // Request notification permission for incoming patient notifications
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

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
      loginUrl.searchParams.set('portal', 'doctors')
      loginUrl.searchParams.set('returnTo', `${window.location.origin}/doctors/call/${roomId}`)
      window.location.href = loginUrl.toString()
      return
    }

    if (typedProfile?.role !== 'doctor') {
      window.location.href = '/'
      return
    }

    setIsReady(true)
  }, [session, loading, roomId, typedProfile])

  const saveTranscription = useCallback(async (segments: TranscriptSegment[]) => {
    if (transcriptionSavedRef.current || segments.length === 0) return
    transcriptionSavedRef.current = true

    const finalSegments = segments.filter(s => s.isFinal)
    if (finalSegments.length === 0) return

    const fullText = finalSegments.map(s => s.text).join(' ')
    const durationSeconds = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : undefined

    try {
      await fetch(`/api/doctors/consultations/${roomId}/transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: finalSegments,
          fullText,
          durationSeconds,
          consentDoctor: true,
          lang: 'es-AR',
        }),
      })
    } catch (err) {
      logger.error('[DoctorCallPage] Failed to save transcription', err)
    }
  }, [roomId])

  const handleCallEnd = useCallback(() => {
    if (transcriptionState.isTranscribing) {
      transcriptionActions.stop()
    }
    saveTranscription(transcriptionState.segments)
    // Redirect to post-consultation report page
    window.location.href = `/doctors/call/${roomId}/report`
  }, [roomId, transcriptionState.segments, transcriptionState.isTranscribing, transcriptionActions, saveTranscription])

  const handleCallStart = useCallback(() => {
    callStartTimeRef.current = Date.now()
    // Auto-start transcription silently when call begins
    if (transcriptionState.isSupported && !transcriptionStartedRef.current) {
      transcriptionStartedRef.current = true
      transcriptionActions.start()
    }
    // Notify doctor that patient connected
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Paciente conectado', {
          body: 'El paciente se ha unido a la consulta',
          icon: '/icons/logo-192.png',
          tag: 'patient-connected',
        })
      } catch { /* ignore */ }
    }
  }, [transcriptionState.isSupported, transcriptionActions])

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
      <div className={`flex-1 min-w-0 transition-all duration-300 relative ${panelCollapsed ? '' : 'mr-0'}`}>
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

        {/* Transcription active indicator — minimal, non-intrusive */}
        {transcriptionState.isTranscribing && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-black/40 rounded-full px-2.5 py-1" title="Transcripción activa">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-slate-400 select-none">REC</span>
          </div>
        )}
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
