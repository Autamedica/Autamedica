import React, { useState, useEffect, useCallback, useRef } from 'react'
import { QrCode, Copy, Check, Clock, ShieldCheck, CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { createBrowserClient } from '@autamedica/auth'

export interface PixCheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'appointment' | 'subscription' | 'wallet_topup'
  appointmentId?: string
  patientCpf?: string
  amountCents?: number
  onSuccess?: () => void
}

interface PixData {
  paymentId: number
  status: string
  qrCode: string
  qrCodeBase64: string
  ticketUrl: string
  expiresAt: string
  amountCents: number
  currency: string
}

export const PixCheckoutModal: React.FC<PixCheckoutModalProps> = ({
  isOpen,
  onClose,
  type,
  appointmentId,
  patientCpf,
  amountCents,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pixData, setPixData] = useState<PixData | null>(null)
  const [copied, setCopied] = useState(false)
  const [isApproved, setIsApproved] = useState(false)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const isPollingRef = useRef(false)

  // 1. Generar cobro Pix al abrir el modal
  const generatePix = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPixData(null)
    setIsApproved(false)
    try {
      const res = await fetch('/api/payments/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, appointmentId, patientCpf, amountCents }),
      })

      const resJson = await res.json()
      if (!res.ok) {
        throw new Error(resJson.error?.message || resJson.message || 'Falha ao gerar QR Code Pix oficial')
      }

      const payload = resJson.data ?? resJson
      setPixData(payload)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao gerar pagamento Pix'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [type, appointmentId, patientCpf, amountCents])

  useEffect(() => {
    if (isOpen) {
      generatePix()
    } else {
      setPixData(null)
      setIsApproved(false)
      setError(null)
    }
  }, [isOpen, generatePix])

  // 2. Temporizador de cuenta regresiva
  useEffect(() => {
    if (!pixData?.expiresAt) return
    const interval = setInterval(() => {
      const remaining = new Date(pixData.expiresAt).getTime() - Date.now()
      if (remaining <= 0) {
        setTimeLeft('Expirado')
        clearInterval(interval)
      } else {
        const mins = Math.floor(remaining / 60000)
        const secs = Math.floor((remaining % 60000) / 1000)
        setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [pixData?.expiresAt])

  // 3. Escucha en Tiempo Real con Supabase Realtime + Polling Fallback
  useEffect(() => {
    if (!isOpen || !pixData || isApproved) return

    let isMounted = true
    let realtimeChannel: ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null = null

    try {
      const supabase = createBrowserClient()
      const tableToListen = type === 'appointment' ? 'appointment_payments' : 'patient_subscriptions'
      const filterClause = type === 'appointment' && appointmentId
        ? `appointment_id=eq.${appointmentId}`
        : undefined

      const channelBuilder = supabase
        .channel(`pix_realtime_${pixData.paymentId}`)

      if (filterClause) {
        realtimeChannel = channelBuilder
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: tableToListen, filter: filterClause },
            (payload: { new?: { status?: string } }) => {
              const status = payload.new?.status
              if (status === 'approved' || status === 'active') {
                if (isMounted) {
                  setIsApproved(true)
                  setTimeout(() => {
                    onSuccess?.()
                  }, 1800)
                }
              }
            },
          )
          .subscribe()
      } else {
        // Para suscripciones el polling garantiza la consulta segura autenticada
        realtimeChannel = null
      }
    } catch (realtimeErr) {
      console.warn('[PixCheckoutModal] Realtime subscription fallback to polling', realtimeErr)
    }

    // Polling de respaldo cada 3.5 segundos
    const pollInterval = setInterval(async () => {
      if (isPollingRef.current || isApproved) return
      isPollingRef.current = true

      try {
        const statusRes = await fetch(`/api/payments/pix/${pixData.paymentId}/status`)
        if (statusRes.ok) {
          const statusJson = await statusRes.json()
          if (statusJson.status === 'approved' || statusJson.status === 'active') {
            if (isMounted) {
              setIsApproved(true)
              clearInterval(pollInterval)
              setTimeout(() => {
                onSuccess?.()
              }, 1800)
            }
          }
        }
      } catch (pollErr) {
        console.warn('[PixCheckoutModal] Polling error', pollErr)
      } finally {
        isPollingRef.current = false
      }
    }, 3500)

    return () => {
      isMounted = false
      clearInterval(pollInterval)
      if (realtimeChannel) {
        try {
          const supabase = createBrowserClient()
          supabase.removeChannel(realtimeChannel)
        } catch {
          // ignore channel removal error on unmount
        }
      }
    }
  }, [isOpen, pixData, isApproved, type, onSuccess])

  const copyToClipboard = () => {
    if (!pixData?.qrCode) return
    navigator.clipboard.writeText(pixData.qrCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  if (!isOpen) return null

  const formatBrl = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-neutral-200 overflow-hidden text-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
              <QrCode className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-950">Pagamento Instantâneo via Pix</h3>
              <p className="text-xs text-neutral-500 font-medium">AutaMedica Brasil · Confirmação Automática</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 text-lg font-bold p-1 transition"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              <p className="text-sm font-medium text-neutral-700">Gerando QR Code Pix oficial...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>Erro ao gerar cobrança Pix</span>
              </div>
              <p className="text-xs leading-relaxed">{error}</p>
              <button
                onClick={generatePix}
                className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar Novamente
              </button>
            </div>
          )}

          {isApproved && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h4 className="text-xl font-bold text-neutral-950">Pagamento Confirmado!</h4>
              <p className="text-xs text-neutral-600 max-w-xs leading-relaxed">
                {type === 'subscription'
                  ? 'Sua assinatura do Plano Cuidado foi ativada com sucesso.'
                  : 'Sua consulta médica foi confirmada na plataforma.'}
              </p>
              <span className="text-xs text-emerald-700 font-semibold mt-1">Atualizando sua conta...</span>
            </div>
          )}

          {!loading && !error && !isApproved && pixData && (
            <div className="space-y-4">
              {/* Valor e Timer */}
              <div className="flex items-center justify-between bg-neutral-50 px-4 py-3 rounded-2xl border border-neutral-200">
                <div>
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                    {type === 'subscription' ? 'Plano Cuidado (Mensal)' : 'Valor da Consulta'}
                  </span>
                  <p className="text-xl font-bold text-neutral-950">
                    {formatBrl(pixData.amountCents)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 bg-white px-3 py-1.5 rounded-xl border border-neutral-200 shadow-xs">
                  <Clock className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Expira em: <strong className="text-neutral-950">{timeLeft}</strong></span>
                </div>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-neutral-200 shadow-xs">
                {pixData.qrCodeBase64 ? (
                  <img
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="w-44 h-44 object-contain rounded-lg"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center bg-neutral-100 rounded-lg text-neutral-400">
                    <QrCode className="w-16 h-16" />
                  </div>
                )}
                <span className="text-[11px] text-neutral-500 mt-2 font-medium">
                  Abra o aplicativo do seu banco e escaneie o código
                </span>
              </div>

              {/* Pix Copia e Cola */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-800">Pix Copia e Cola:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pixData.qrCode}
                    className="w-full text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-neutral-700 select-all truncate focus:outline-none focus:border-neutral-400"
                  />
                  <button
                    onClick={copyToClipboard}
                    className={`shrink-0 px-4 py-2.5 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 shadow-xs ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-neutral-950 hover:bg-neutral-800 text-white'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              {/* Status de aguardo em tempo real */}
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-neutral-500 pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>Aguardando identificação instantânea do Pix...</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-neutral-400 border-t border-neutral-100 pt-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Ambiente Seguro · Pix Banco Central do Brasil</span>
        </div>
      </div>
    </div>
  )
}
