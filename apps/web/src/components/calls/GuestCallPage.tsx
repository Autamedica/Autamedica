'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchApi } from '@/lib/api-client'
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
  dispatchId?: string
  guestToken?: string
  language?: 'pt' | 'es'
}

type EncounterDocument = {
  id: string; kind: 'memed' | 'core' | 'certificate'; title: string; provider: string;
  createdAt: string; status: string; verificationCode: string | null; downloadUrl: string;
}

export interface CallEndedScreenProps {
  doctorName?: string
  clinicName?: string
  language?: 'pt' | 'es'
  whatsappUrl?: string
  documents?: EncounterDocument[]
}

const CALL_ENDED_I18N = {
  pt: {
    statusBadge: 'Atendimento Finalizado',
    title: 'Consulta Concluída',
    subtitle: (doctor: string) => `Atendimento médico realizado por ${doctor}`,
    prescriptionTitle: 'Receita Médica Digital (ICP-Brasil)',
    prescriptionDesc: 'Os documentos emitidos nesta consulta aparecem abaixo.',
    prescriptionBadge: 'Assinada digitalmente',
    continuityTitle: 'Documentos da consulta',
    continuityDesc: 'Abra ou compartilhe os documentos emitidos durante o atendimento.',
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
    prescriptionDesc: 'Los documentos emitidos en esta consulta aparecen abajo.',
    prescriptionBadge: 'Firmada digitalmente',
    continuityTitle: 'Documentos de la consulta',
    continuityDesc: 'Abrí o compartí los documentos emitidos durante la atención.',
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
  documents = [],
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
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-3 sm:p-6 relative select-none font-sans overflow-x-hidden">
      {/* ── Background concentric pulse decoration ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-slate-200/30 animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-slate-200/40" />
      </div>

      <div className="w-full max-w-lg flex flex-col items-center relative z-10">
        {/* ── Minimal Brand Header ── */}
        <header className="flex items-center gap-2.5 mb-5">
          <img
            src="/logo.png"
            alt="AutaMedica"
            className="h-7 w-7 sm:h-8 sm:w-8 object-contain"
          />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {clinicName}
          </span>
        </header>

        {/* ── Official High-Discharge Card ── */}
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 sm:p-8 shadow-sm flex flex-col items-center text-center">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium mb-3.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{t.statusBadge}</span>
          </div>

          {/* Title in Source Serif 4 */}
          <h1 className="text-2xl sm:text-3xl font-heading text-slate-900 tracking-tight">
            {t.title}
          </h1>

          {/* Subtitle with Doctor Name */}
          <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-sm">
            {t.subtitle(doctorName)}
          </p>

          {/* ── Issued encounter documents ── */}
          <div className="w-full space-y-3 mt-6 text-left">
            {documents.length > 0 ? documents.map((document) => {
              const href = new URL(document.downloadUrl, window.location.origin).toString()
              const share = `https://wa.me/?text=${encodeURIComponent(`${document.title} · AutaMedica: ${href}`)}`
              return (
                <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-slate-900">
                        {document.kind === 'certificate' ? (language === 'pt' ? 'Atestado / Certificado Médico' : 'Atestado / Certificado Médico') : document.kind === 'memed' ? 'Receita Digital Memed' : 'Receta Digital RCTA'}
                      </h2>
                      <p className="mt-1 truncate text-xs text-slate-600">{document.title} · {document.provider}</p>
                      {document.verificationCode && <p className="mt-1 text-[11px] text-slate-500">{language === 'pt' ? 'Código de verificação' : 'Código de verificación'}: <span className="font-mono font-semibold text-slate-800">{document.verificationCode}</span></p>}
                    </div>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-[#10B981] px-3 text-xs font-semibold text-white hover:bg-[#0D9488]">{language === 'pt' ? 'Abrir documento' : 'Abrir documento'}</a>
                    <a href={share} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700">{language === 'pt' ? 'Compartilhar' : 'Compartir'}</a>
                  </div>
                </article>
              )
            }) : (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                {language === 'pt' ? 'Nenhum documento foi emitido nesta consulta.' : 'No se emitieron documentos en esta consulta.'}
              </p>
            )}
          </div>

          {/* ── Action Buttons ── */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full mt-6">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-[#0EA5E9] hover:bg-sky-600 text-white font-semibold px-6 py-3 text-sm shadow-xl shadow-sky-100 transition-all active:scale-[0.99]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:animate-[am-shimmer_2s_infinite]" />
              <MessageCircle className="w-4 h-4 fill-current" />
              <span>{t.btnWhatsApp}</span>
            </a>

            <button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-am-surface-700 hover:bg-am-surface-600 text-slate-700 hover:text-white border border-am-surface-600/60 font-medium px-5 py-3 text-sm transition-all active:scale-[0.99]"
            >
              <X className="w-4 h-4" />
              <span>{t.btnClose}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

function ErrorScreen({ language }: { language: 'pt' | 'es' }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{language === 'pt' ? 'Não foi possível conectar' : 'No pudimos conectar'}</h1>
        <p className="mt-2 text-sm text-slate-600">{language === 'pt' ? 'Tente novamente.' : 'Volvé a intentar.'}</p>
      </div>
    </div>
  )
}

function LoadingScreen({ language }: { language: 'pt' | 'es' }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#0EA5E9]" />
        <p className="mt-4 text-sm text-slate-600">{language === 'pt' ? 'Preparando a videochamada...' : 'Preparando la videollamada...'}</p>
      </div>
    </div>
  )
}
export default function GuestCallPage({ roomId, dispatchId, guestToken, language: requestedLanguage }: GuestCallPageProps) {
  const [ended, setEnded] = useState(false)
  const [inWaitingRoom, setInWaitingRoom] = useState(true)
  const [documents, setDocuments] = useState<EncounterDocument[]>([])

  const { token, inviteId } = useMemo(() => {
    if (typeof window === 'undefined') return { token: null, inviteId: null }
    const params = new URLSearchParams(window.location.search)
    return { token: params.get('token'), inviteId: params.get('invite') }
  }, [])

  const language = useMemo<'pt' | 'es'>(() => {
    if (requestedLanguage) return requestedLanguage
    if (typeof window === 'undefined') return 'pt'
    const params = new URLSearchParams(window.location.search)
    const lang = params.get('lang')
    if (lang === 'es' || lang === 'pt') return lang
    return 'pt'
  }, [requestedLanguage])

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

  useEffect(() => {
    if (!ended || !dispatchId || !(guestToken || token)) return
    let current = true
    let attempts = 0
    const loadDocuments = async () => {
      attempts += 1
      try {
        const accessToken = guestToken || token
        const response = await fetchApi<{ documents?: EncounterDocument[] }>(
          `/api/pharmacy/dispatch/${encodeURIComponent(dispatchId)}?token=${encodeURIComponent(accessToken!)}`,
        )
        if (current && Array.isArray(response.documents)) setDocuments(response.documents)
      } catch {
        // The dispatch may still be transitioning to completed; retry briefly.
      }
    }
    void loadDocuments()
    const timer = window.setInterval(() => {
      if (attempts >= 12) { window.clearInterval(timer); return }
      void loadDocuments()
    }, 2500)
    return () => { current = false; window.clearInterval(timer) }
  }, [ended, dispatchId, guestToken, token])

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
        documents={documents}
      />
    )
  }
  if (error) return <ErrorScreen language={language} />
  if (loading || !callSession || !callProvider) return <LoadingScreen language={language} />

  if (inWaitingRoom) {
    return (
      <PatientWaitingRoom
        doctorName={doctorDisplayName}
        clinicName="AutaMedica"
        patientName={callSession.user.displayName || 'Paciente'}
        triageCompleted={false}
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
