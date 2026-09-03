import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  QrCode,
  Copy,
  Check,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  Stethoscope,
  Sparkles,
} from 'lucide-react'
import QRCode from 'qrcode'
import { createBrowserClient } from '@autamedica/auth'
import { formatBrlFromCents } from '@/lib/payments/money'

export interface PixPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  appointmentId?: string
  doctorName?: string
  doctorRole?: string
  doctorCrm?: string
  patientCpf?: string
  amountCents?: number
  consultationTitle?: string
  language?: 'pt' | 'es'
  onSuccess?: (paymentId?: number | string) => void
}

interface PixData {
  paymentId: number | string
  status: string
  qrCode: string
  qrCodeBase64?: string
  ticketUrl?: string
  expiresAt?: string
  amountCents: number
  currency: string
}

const I18N = {
  pt: {
    title: 'Pagamento Instantâneo Pix',
    subtitle: 'Teleconsulta Particular · AutaMedica Brasil',
    consultationLabel: 'Valor da Consulta',
    expiresIn: 'Expira em:',
    expired: 'Expirado',
    qrInstruction: 'Abra o aplicativo do seu banco, escolha Pix e escaneie o código',
    copyPasteLabel: 'Pix Copia e Cola:',
    copyBtn: 'Copiar',
    copiedBtn: 'Copiado!',
    waitingStatus: 'Aguardando pagamento via Pix...',
    approvedTitle: 'Pagamento Confirmado!',
    approvedSubtitle: 'Sua teleconsulta foi confirmada. Liberando acesso ao consultório...',
    secureEnvironment: 'Ambiente Seguro · Pix Banco Central do Brasil · AutaMedica',
    errorTitle: 'Erro ao gerar cobrança Pix',
    retryBtn: 'Tentar Novamente',
    defaultDoctor: 'Médico Especialista',
    defaultRole: 'Clínica Geral & Telemedicina',
    simulatedSuccessBtn: 'Simular Confirmação Pix (Dev)',
  },
  es: {
    title: 'Pago Instantáneo Pix',
    subtitle: 'Teleconsulta Particular · AutaMedica Brasil',
    consultationLabel: 'Valor de la Consulta',
    expiresIn: 'Expira en:',
    expired: 'Expirado',
    qrInstruction: 'Abrí la app de tu banco, elegí Pix y escaneá el código',
    copyPasteLabel: 'Pix Copia y Pega:',
    copyBtn: 'Copiar',
    copiedBtn: '¡Copiado!',
    waitingStatus: 'Esperando confirmación del pago Pix...',
    approvedTitle: '¡Pago Confirmado!',
    approvedSubtitle: 'Tu teleconsulta fue confirmada. Habilitando ingreso al consultorio...',
    secureEnvironment: 'Ambiente Seguro · Pix Banco Central de Brasil · AutaMedica',
    errorTitle: 'Error al generar cobro Pix',
    retryBtn: 'Intentar Nuevamente',
    defaultDoctor: 'Médico Especialista',
    defaultRole: 'Clínica General & Telemedicina',
    simulatedSuccessBtn: 'Simular Confirmación Pix (Dev)',
  },
}

export const PixPaymentModal: React.FC<PixPaymentModalProps> = ({
  isOpen,
  onClose,
  appointmentId,
  doctorName = 'Dr. Felipe Silva',
  doctorRole = 'Clínica Geral & Telemedicina',
  doctorCrm = 'CRM/SP 184.920',
  patientCpf,
  amountCents = 15000,
  language = 'pt',
  onSuccess,
}) => {
  const t = I18N[language] || I18N.pt

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pixData, setPixData] = useState<PixData | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isApproved, setIsApproved] = useState(false)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const isPollingRef = useRef(false)

  // 1. Generar cobro Pix al abrir el modal
  const generatePix = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPixData(null)
    setQrDataUrl(null)
    setIsApproved(false)

    try {
      const res = await fetch('/api/payments/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          type: 'appointment',
          appointmentId: appointmentId || undefined,
          patientCpf: patientCpf || undefined,
          amountCents,
        }),
      })

      const rawText = await res.text()
      let resJson: Record<string, unknown> | null = null
      try {
        resJson = JSON.parse(rawText) as Record<string, unknown>
      } catch {
        throw new Error(t.errorTitle)
      }

      if (!res.ok) {
        const errMsg = (resJson?.error as { message?: string } | undefined)?.message ||
          (resJson?.message as string | undefined) ||
          t.errorTitle
        throw new Error(errMsg)
      }

      const payload: PixData = (resJson?.data as PixData) ?? (resJson as unknown as PixData)
      setPixData(payload)

      // Si la API no retorna qrCodeBase64, generamos la imagen del QR client-side
      if (payload.qrCodeBase64) {
        setQrDataUrl(`data:image/png;base64,${payload.qrCodeBase64}`)
      } else if (payload.qrCode) {
        const generated = await QRCode.toDataURL(payload.qrCode, {
          margin: 1,
          width: 256,
          color: {
            dark: '#09090b',
            light: '#ffffff',
          },
        })
        setQrDataUrl(generated)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.errorTitle
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [appointmentId, patientCpf, amountCents, t.errorTitle])

  useEffect(() => {
    if (isOpen) {
      void generatePix()
    } else {
      setPixData(null)
      setQrDataUrl(null)
      setIsApproved(false)
      setError(null)
    }
  }, [isOpen, generatePix])

  // 2. Temporizador de cuenta regresiva
  useEffect(() => {
    if (!pixData?.expiresAt) return

    const calculateRemaining = () => {
      const remaining = new Date(pixData.expiresAt ?? '').getTime() - Date.now()
      if (remaining <= 0) {
        setTimeLeft(t.expired)
      } else {
        const totalSecs = Math.floor(remaining / 1000)
        const mins = Math.floor((totalSecs % 3600) / 60)
        const secs = totalSecs % 60
        setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`)
      }
    }

    calculateRemaining()
    const interval = setInterval(calculateRemaining, 1000)
    return () => clearInterval(interval)
  }, [pixData?.expiresAt, t.expired])

  // 3. Verificación de estado en tiempo real (Supabase Realtime + Polling cada 3 segundos)
  useEffect(() => {
    if (!isOpen || !pixData || isApproved) return

    let isMounted = true
    let realtimeChannel: ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null = null

    try {
      const supabase = createBrowserClient()
      const filterClause = appointmentId ? `appointment_id=eq.${appointmentId}` : undefined

      if (filterClause) {
        realtimeChannel = supabase
          .channel(`pix_appointment_${pixData.paymentId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'appointment_payments',
              filter: filterClause,
            },
            (payload: { new?: { status?: string } }) => {
              const status = payload.new?.status
              if (status === 'approved' || status === 'confirmed') {
                if (isMounted) {
                  setIsApproved(true)
                  setTimeout(() => {
                    onSuccess?.(pixData.paymentId)
                  }, 1800)
                }
              }
            },
          )
          .subscribe()
      }
    } catch (realtimeErr) {
      console.warn('[PixPaymentModal] Realtime fallback to polling', realtimeErr)
    }

    // Polling recurrente a la API oficial de verificación
    const pollInterval = setInterval(async () => {
      if (isPollingRef.current || isApproved) return
      isPollingRef.current = true

      try {
        const statusRes = await fetch(`/api/payments/pix/${pixData.paymentId}/status`)
        if (statusRes.ok) {
          const statusJson = await statusRes.json()
          if (statusJson.status === 'approved' || statusJson.status === 'confirmed') {
            if (isMounted) {
              setIsApproved(true)
              clearInterval(pollInterval)
              setTimeout(() => {
                onSuccess?.(pixData.paymentId)
              }, 1800)
            }
          }
        }
      } catch (pollErr) {
        console.warn('[PixPaymentModal] Polling error', pollErr)
      } finally {
        isPollingRef.current = false
      }
    }, 3000)

    return () => {
      isMounted = false
      clearInterval(pollInterval)
      if (realtimeChannel) {
        try {
          const supabase = createBrowserClient()
          supabase.removeChannel(realtimeChannel)
        } catch {
          // ignore channel cleanup errors
        }
      }
    }
  }, [isOpen, pixData, isApproved, appointmentId, onSuccess])

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const copyToClipboard = () => {
    if (!pixData?.qrCode) return
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
    }
    navigator.clipboard.writeText(pixData.qrCode).catch(() => {})
    setCopied(true)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2500)
  }

  const handleSimulatePayment = () => {
    setIsApproved(true)
    setTimeout(() => {
      onSuccess?.(pixData?.paymentId || 'simulated_dev_payment')
    }, 1500)
  }

  if (!isOpen) return null

  const isDevMode =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname.includes('127.0.0.1') ||
      window.location.pathname.includes('/demo/'))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-md rounded-3xl bg-am-surface-900 border border-am-surface-700/70 p-5 sm:p-6 shadow-2xl overflow-hidden text-am-surface-50">
        {/* Subtle Ambient Light Gradients (Dark Mode) */}
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-am-primary-600/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-am-primary-400/5 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-am-surface-800 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-am-surface-800 text-am-primary-400 border border-am-surface-700 shadow-inner">
              <QrCode className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-am-surface-50 font-heading tracking-tight">
                {t.title}
              </h3>
              <p className="text-xs text-am-surface-400 font-medium">
                {t.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-am-surface-400 hover:text-white p-2 rounded-full hover:bg-am-surface-800 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 relative z-10">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="p-3 rounded-full bg-am-surface-800 border border-am-surface-700">
                <Loader2 className="w-7 h-7 text-am-primary-400 animate-spin" />
              </div>
              <p className="text-sm font-medium text-am-surface-300">
                Gerando QR Code Pix oficial...
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-300 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm text-rose-200">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                <span>{t.errorTitle}</span>
              </div>
              <p className="text-xs leading-relaxed text-rose-300/90">{error}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={generatePix}
                  className="w-full py-2.5 bg-am-surface-800 hover:bg-am-surface-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-am-surface-600 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t.retryBtn}
                </button>
                {isDevMode && (
                  <button
                    type="button"
                    onClick={handleSimulatePayment}
                    className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Simular (Dev)
                  </button>
                )}
              </div>
            </div>
          )}

          {isApproved && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-lg shadow-emerald-500/5">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h4 className="text-xl font-bold text-white font-heading tracking-tight">
                {t.approvedTitle}
              </h4>
              <p className="text-xs text-am-surface-300 max-w-xs leading-relaxed">
                {t.approvedSubtitle}
              </p>
              <span className="text-xs text-am-primary-400 font-semibold mt-1 animate-pulse">
                Conectando à consulta...
              </span>
            </div>
          )}

          {!loading && !error && !isApproved && pixData && (
            <div className="space-y-3.5">
              {/* Resumen del Profesional y Especialidad */}
              <div className="flex items-center gap-3 bg-am-surface-800/80 border border-am-surface-700/60 rounded-2xl p-3">
                <div className="h-10 w-10 rounded-xl bg-am-surface-700 flex items-center justify-center text-am-primary-400 border border-am-surface-600 shrink-0">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-am-surface-100 truncate">
                    {doctorName}
                  </p>
                  <p className="text-[11px] text-am-surface-400 truncate">
                    {doctorRole} {doctorCrm ? `· ${doctorCrm}` : ''}
                  </p>
                </div>
              </div>

              {/* Valor de la Consulta y Countdown */}
              <div className="flex items-center justify-between bg-am-surface-800/90 border border-am-surface-700/60 px-4 py-3 rounded-2xl">
                <div>
                  <span className="text-[10px] font-bold text-am-surface-400 uppercase tracking-wider block">
                    {t.consultationLabel}
                  </span>
                  <p className="text-xl font-bold text-white font-heading">
                    {formatBrlFromCents(pixData.amountCents || amountCents)}
                  </p>
                </div>
                {timeLeft && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-am-surface-200 bg-am-surface-900 px-3 py-1.5 rounded-xl border border-am-surface-700/80 shadow-xs">
                    <Clock className="w-3.5 h-3.5 text-am-primary-400" />
                    <span>
                      {t.expiresIn} <strong className="text-white">{timeLeft}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-am-surface-800/50 rounded-2xl border border-am-surface-700/60 shadow-inner">
                {qrDataUrl ? (
                  <div className="bg-white p-2.5 rounded-2xl shadow-lg border border-white/20">
                    <img
                      src={qrDataUrl}
                      alt="QR Code Pix"
                      className="w-44 h-44 object-contain rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center bg-am-surface-800 rounded-xl text-am-surface-500 border border-am-surface-700">
                    <QrCode className="w-16 h-16" />
                  </div>
                )}
                <span className="text-[11px] text-am-surface-400 mt-2.5 text-center font-medium max-w-xs">
                  {t.qrInstruction}
                </span>
              </div>

              {/* Pix Copia e Cola */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-am-surface-300">
                  {t.copyPasteLabel}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pixData.qrCode}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full text-xs font-mono bg-am-surface-950 border border-am-surface-700 rounded-xl px-3 py-2.5 text-am-surface-200 select-all truncate focus:outline-none focus:border-am-primary-500"
                  />
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className={`shrink-0 px-4 py-2.5 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 shadow-sm active:scale-[0.98] ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-am-primary-600 hover:bg-am-primary-500 text-white'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? t.copiedBtn : t.copyBtn}</span>
                  </button>
                </div>
              </div>

              {/* Indicador de Estado en Tiempo Real */}
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-am-surface-400 pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-am-primary-400 shrink-0" />
                <span>{t.waitingStatus}</span>
              </div>

              {/* Botón de simulación para desarrollo/QA */}
              {isDevMode && (
                <div className="pt-1 flex justify-center">
                  <button
                    type="button"
                    onClick={handleSimulatePayment}
                    className="text-[11px] text-am-surface-400 hover:text-emerald-400 underline transition-colors"
                  >
                    {t.simulatedSuccessBtn}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-am-surface-400 border-t border-am-surface-800 pt-3 relative z-10">
          <ShieldCheck className="w-4 h-4 text-am-primary-400 shrink-0" />
          <span>{t.secureEnvironment}</span>
        </div>
      </div>
    </div>
  )
}
export default PixPaymentModal
