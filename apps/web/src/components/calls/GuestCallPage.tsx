'use client'

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  FileText,
  HeartPulse,
  Activity,
  MessageCircle,
  X,
} from 'lucide-react'
import { UnifiedVideoCall, createCallProvider } from '@autamedica/telemedicine'
import { useGuestCallSession } from '@/hooks/calls/useGuestCallSession'
import PatientWaitingRoom from '@/components/calls/PatientWaitingRoom'

interface GuestCallPageProps {
  roomId: string
}

export interface CallEndedScreenProps {
  doctorName?: string
  clinicName?: string
  language?: 'pt' | 'es'
  whatsappUrl?: string
}

const CALL_ENDED_I18N = {
  pt: {
    statusBadge: 'Atendimento Finalizado',
    title: 'Consulta Concluída',
    subtitle: (doctor: string) => `Atendimento médico realizado por ${doctor}`,
    prescriptionTitle: 'Receita Médica Digital (ICP-Brasil)',
    prescriptionDesc: 'Enviada ao seu WhatsApp e SMS cadastrados.',
    prescriptionBadge: 'Assinada digitalmente',
    continuityTitle: 'Acompanhamento Clínico em 48h',
    continuityDesc: 'Em 48 horas enviaremos uma mensagem automática pelo WhatsApp para checar sua evolução clínica e sintomas.',
    continuityBadge: 'Linha de cuidado',
    btnWhatsApp: 'Voltar para o WhatsApp',
    btnClose: 'Fechar Janela',
    footerNotice: 'AutaMedica • Telemedicina em conformidade com CFM 2.314/2022 e LGPD',
  },
  es: {
    statusBadge: 'Atención Finalizada',
    title: 'Consulta Concluida',
    subtitle: (doctor: string) => `Atención médica realizada por ${doctor}`,
    prescriptionTitle: 'Receta Médica Digital',
    prescriptionDesc: 'Enviada a tu WhatsApp y SMS registrados.',
    prescriptionBadge: 'Firmada digitalmente',
    continuityTitle: 'Seguimiento Clínico en 48h',
    continuityDesc: 'En 48 horas enviaremos un mensaje automático por WhatsApp para chequear tu evolución clínica y síntomas.',
    continuityBadge: 'Línea de cuidado',
    btnWhatsApp: 'Volver al WhatsApp',
    btnClose: 'Cerrar Ventana',
    footerNotice: 'AutaMedica • Telemedicina y Protección de Datos Personales',
  },
}

export function CallEndedScreen({
  doctorName = 'Dr. Felipe Silva',
  clinicName = 'AutaMedica',
  language = 'pt',
  whatsappUrl = 'https://wa.me/',
}: CallEndedScreenProps) {
  const t = CALL_ENDED_I18N[language] || CALL_ENDED_I18N.pt

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      window.close()
      setTimeout(() => {
        if (!window.closed) {
          window.location.href = '/'
        }
      }, 250)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-am-surface-900 text-am-surface-100 flex flex-col items-center justify-center p-4 sm:p-6 relative select-none font-sans overflow-x-hidden">
      {/* ── Background concentric pulse decoration ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-am-surface-700/30 animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-am-surface-700/40" />
      </div>

      <div className="w-full max-w-lg flex flex-col items-center relative z-10">
        {/* ── Minimal Brand Header ── */}
        <header className="flex items-center gap-2.5 mb-5">
          <img
            src="/logo.png"
            alt="AutaMedica"
            className="h-7 w-7 sm:h-8 sm:w-8 object-contain"
          />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-am-surface-400">
            {clinicName}
          </span>
        </header>

        {/* ── Official High-Discharge Card ── */}
        <div className="w-full rounded-3xl border border-am-surface-700/60 bg-am-surface-800/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-black/40 flex flex-col items-center text-center">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-medium mb-3.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{t.statusBadge}</span>
          </div>

          {/* Title in Source Serif 4 */}
          <h1 className="text-2xl sm:text-3xl font-heading text-am-surface-50 tracking-tight">
            {t.title}
          </h1>

          {/* Subtitle with Doctor Name */}
          <p className="mt-2 text-xs sm:text-sm text-am-surface-300 max-w-sm">
            {t.subtitle(doctorName)}
          </p>

          {/* ── Section: Cards ── */}
          <div className="w-full space-y-3 mt-6 text-left">
            {/* Card 1: Receita Médica Digital (ICP-Brasil) */}
            <div className="w-full rounded-2xl border border-am-surface-700/70 bg-am-surface-900/70 p-4 transition-colors hover:border-am-primary-500/40">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-am-primary-950/70 border border-am-primary-500/30 text-am-primary-400 flex-shrink-0 mt-0.5">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <h2 className="text-xs sm:text-sm font-semibold text-am-surface-50">
                      {t.prescriptionTitle}
                    </h2>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      {t.prescriptionBadge}
                    </span>
                  </div>
                  <p className="text-xs text-am-surface-300 leading-relaxed">
                    {t.prescriptionDesc}
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Acompanhamento Clínico 48h (Línea 4 de Eduardo) */}
            <div className="w-full rounded-2xl border border-am-surface-700/70 bg-am-surface-900/70 p-4 transition-colors hover:border-am-primary-500/40">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 flex-shrink-0 mt-0.5">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <h2 className="text-xs sm:text-sm font-semibold text-am-surface-50">
                      {t.continuityTitle}
                    </h2>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-am-primary-300 bg-am-surface-800 px-2 py-0.5 rounded-md border border-am-surface-700">
                      <Activity className="w-3 h-3 text-am-primary-400" />
                      {t.continuityBadge}
                    </span>
                  </div>
                  <p className="text-xs text-am-surface-300 leading-relaxed">
                    {t.continuityDesc}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Action Buttons ── */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full mt-6">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 text-sm shadow-xl shadow-emerald-950/40 transition-all active:scale-[0.99]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:animate-[am-shimmer_2s_infinite]" />
              <MessageCircle className="w-4 h-4 fill-current" />
              <span>{t.btnWhatsApp}</span>
            </a>

            <button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-am-surface-700 hover:bg-am-surface-600 text-am-surface-200 hover:text-white border border-am-surface-600/60 font-medium px-5 py-3 text-sm transition-all active:scale-[0.99]"
            >
              <X className="w-4 h-4" />
              <span>{t.btnClose}</span>
            </button>
          </div>
        </div>

        {/* ── Footer / Regulatory Note ── */}
        <p className="text-[10px] sm:text-[11px] text-am-surface-400 text-center mt-5">
          {t.footerNotice}
        </p>
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-[100dvh] bg-am-surface-900 flex flex-col items-center justify-center p-6 text-am-surface-100">
      <div className="max-w-md w-full rounded-2xl border border-rose-900/50 bg-am-surface-800 p-8 text-center shadow-xl">
        <h1 className="text-lg font-semibold text-rose-400">No se pudo conectar</h1>
        <p className="mt-3 text-sm text-am-surface-400">{message}</p>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-[100dvh] bg-am-surface-900 flex flex-col items-center justify-center p-6 text-am-surface-100">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-am-surface-700 border-t-am-primary-400" />
        <p className="mt-4 text-sm text-am-surface-400">Preparando videollamada...</p>
      </div>
    </div>
  )
}

export default function GuestCallPage({ roomId }: GuestCallPageProps) {
  const [ended, setEnded] = useState(false)
  const [inWaitingRoom, setInWaitingRoom] = useState(true)

  const { token, inviteId } = useMemo(() => {
    if (typeof window === 'undefined') return { token: null, inviteId: null }
    const params = new URLSearchParams(window.location.search)
    return { token: params.get('token'), inviteId: params.get('invite') }
  }, [])

  const language = useMemo<'pt' | 'es'>(() => {
    if (typeof window === 'undefined') return 'pt'
    const params = new URLSearchParams(window.location.search)
    const lang = params.get('lang')
    if (lang === 'es' || lang === 'pt') return lang
    return 'pt'
  }, [])

  const whatsappUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://wa.me/'
    const params = new URLSearchParams(window.location.search)
    const customWa = params.get('wa')
    if (customWa) return customWa
    const phone = params.get('phone')
    if (phone) return `https://wa.me/${phone.replace(/\D/g, '')}`
    return 'https://wa.me/'
  }, [])

  const { session: callSession, loading, error } = useGuestCallSession(roomId, token, inviteId)

  const callProvider = useMemo(
    () => callSession
      ? createCallProvider({
          bootstrap: callSession,
          // Guest never uses WebRTC P2P (no Supabase Realtime), always Cloudflare Calls SFU
        })
      : null,
    [callSession],
  )

  const doctorDisplayName = callSession?.peer?.displayName || 'Dr. Felipe Silva'

  if (ended) {
    return (
      <CallEndedScreen
        doctorName={doctorDisplayName}
        clinicName="AutaMedica"
        language={language}
        whatsappUrl={whatsappUrl}
      />
    )
  }
  if (error) return <ErrorScreen message={error} />
  if (loading || !callSession || !callProvider) return <LoadingScreen />

  if (inWaitingRoom) {
    return (
      <PatientWaitingRoom
        doctorName={doctorDisplayName}
        clinicName="AutaMedica"
        patientName={callSession.user.displayName || 'Paciente'}
        triageCompleted={true}
        language={language}
        onJoin={() => setInWaitingRoom(false)}
      />
    )
  }

  return (
    <UnifiedVideoCall
      provider={callProvider}
      roomId={callSession.roomId}
      callId={callSession.callId}
      userId={callSession.user.id}
      userType={callSession.user.role}
      userName={callSession.user.displayName}
      iceServers={callSession.transport.iceServers}
      theme="patient"
      onCallEnd={() => setEnded(true)}
      autoStart
      runtime={callSession.runtime}
      className="h-screen"
    />
  )
}
