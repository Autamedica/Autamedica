'use client'
import { useState, useEffect, useCallback, useId, type FormEvent } from 'react'
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Phone,
  Pill,
  ShieldCheck,
  User,
  Video,
  XCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import type { CreatePharmacyRequestInput, RequestStatusResponse } from '@/lib/pharmacy/types'
import GuestCallPage from '@/components/calls/GuestCallPage'

interface PharmacyExpressConsultationProps {
  pharmacyId?: string | null
  pharmacyName?: string
  initialDni?: string
}

type Step = 'FORM' | 'WAITING' | 'CALL' | 'ENDED' | 'CANCELLED'

const QUICK_REASONS = [
  'Renovación de Receta Crónica',
  'Alergia / Antihistamínico',
  'Molestia Gastrointestinal',
  'Dolor Muscular / Analgesia',
  'Cuadro Respiratorio Leve',
  'Otro Medicamento',
] as const

export function PharmacyExpressConsultation({
  pharmacyId = null,
  pharmacyName = 'Farmacia Adherida',
  initialDni = '',
}: PharmacyExpressConsultationProps) {
  const dniInputId = useId()
  const nameInputId = useId()
  const phoneInputId = useId()
  const reasonInputId = useId()

  const [step, setStep] = useState<Step>('FORM')
  const [formData, setFormData] = useState({
    dni: initialDni,
    name: '',
    phone: '',
    reason: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Active request state
  const [requestId, setRequestId] = useState<string | null>(null)
  const [requestStatus, setRequestStatus] = useState<RequestStatusResponse | null>(null)
  const [callRoomId, setCallRoomId] = useState<string | null>(null)
  const [, setGuestInviteId] = useState<string | null>(null)

  // Polling for status when in WAITING step
  const checkStatus = useCallback(async (id: string) => {
    try {
      const data = await fetchApi<RequestStatusResponse>(`/api/pharmacy/on-demand/status/${id}`)
      setRequestStatus(data)

      if (data.status === 'assigned' || data.status === 'in_call') {
        if (data.roomId && data.guestInviteId) {
          setCallRoomId(data.roomId)
          setGuestInviteId(data.guestInviteId)
          // Update URL params quietly so GuestCallPage picks up the invite parameter if rendered
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.searchParams.set('invite', data.guestInviteId)
            window.history.replaceState(null, '', url.toString())
          }
          setStep('CALL')
        }
      } else if (data.status === 'completed') {
        setStep('ENDED')
      } else if (data.status === 'cancelled' || data.status === 'expired') {
        setStep('CANCELLED')
      }
    } catch {
      // Ignorar fallas transitorias de red durante polling
    }
  }, [])

  useEffect(() => {
    if (step !== 'WAITING' || !requestId) return

    // Chequeo inmediato
    void checkStatus(requestId)

    const interval = setInterval(() => {
      void checkStatus(requestId)
    }, 3000)

    return () => clearInterval(interval)
  }, [step, requestId, checkStatus])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formData.dni.trim() || formData.dni.trim().length < 5) {
      setFormError('Por favor ingresa un número de DNI o documento válido.')
      return
    }
    if (!formData.name.trim() || formData.name.trim().length < 3) {
      setFormError('Por favor ingresa tu nombre y apellido completo.')
      return
    }
    if (!formData.phone.trim() || formData.phone.trim().length < 6) {
      setFormError('Ingresa un número de celular o WhatsApp válido para recibir tu receta.')
      return
    }
    if (!formData.reason.trim()) {
      setFormError('Selecciona o describe el medicamento o motivo de consulta.')
      return
    }

    try {
      setSubmitting(true)

      const payload: CreatePharmacyRequestInput = {
        pharmacyId: pharmacyId || null,
        pharmacyName,
        patientDni: formData.dni.trim(),
        patientName: formData.name.trim(),
        patientPhone: formData.phone.trim(),
        reason: formData.reason.trim(),
      }

      const res = await fetchApi<{
        request: { id: string }
        queuePosition: number
      }>('/api/pharmacy/on-demand/request', {
        method: 'POST',
        body: payload,
      })

      setRequestId(res.request.id)
      setStep('WAITING')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con la guardia médica'
      setFormError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelRequest = async () => {
    if (!requestId) return
    try {
      await fetchApi('/api/pharmacy/on-demand/cancel', {
        method: 'POST',
        body: { requestId },
      })
    } catch {
      // noop
    } finally {
      setStep('CANCELLED')
    }
  }

  // 1. STEP: CALL
  if (step === 'CALL' && callRoomId) {
    return (
      <div className="w-full h-full min-h-[100dvh] bg-am-surface-900">
        <div className="fixed top-3 left-4 z-50 flex items-center gap-2 bg-am-surface-800/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-am-surface-700/60 shadow-lg text-xs font-semibold text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Atención Médica Exprés • {pharmacyName}</span>
        </div>
        <GuestCallPage roomId={callRoomId} />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-am-surface-900 text-am-surface-100 flex flex-col items-center justify-center p-4 sm:p-6 relative select-none font-sans overflow-x-hidden">
      {/* Background glow lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-am-primary-600/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] rounded-full bg-emerald-600/10 blur-3xl" />
      </div>

      <div className="w-full max-w-xl flex flex-col items-center relative z-10 my-auto">
        {/* Brand & Pharmacy Header */}
        <header className="flex flex-col items-center text-center mb-6">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-am-surface-800/90 border border-am-surface-700/60 text-am-surface-200 text-xs font-medium mb-3 shadow-md">
            <Building2 className="w-3.5 h-3.5 text-am-primary-400" />
            <span>Punto de Atención: <strong className="text-white">{pharmacyName}</strong></span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-am-primary-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-am-primary-950/40">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Consulta Exprés en Farmacia
              </h1>
              <p className="text-xs text-am-surface-400">
                Guardia médica remota con emisión de receta digital oficial
              </p>
            </div>
          </div>
        </header>

        {/* STEP: FORM */}
        {step === 'FORM' && (
          <div className="w-full rounded-3xl border border-am-surface-700/60 bg-am-surface-800/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-am-surface-700/50 pb-4 mb-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Atención Inmediata con Médico Matriculado</span>
              </div>
              <span className="text-[11px] text-am-surface-400">Paso 1 de 2</span>
            </div>

            {formError && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={dniInputId} className="block text-xs font-medium text-am-surface-300 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-am-surface-400" />
                    DNI / Documento
                  </label>
                  <input
                    id={dniInputId}
                    type="text"
                    required
                    placeholder="Ej. 35123456"
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-am-surface-900 border border-am-surface-700/80 text-white placeholder-am-surface-500 text-sm focus:outline-none focus:border-am-primary-400 focus:ring-1 focus:ring-am-primary-400 transition"
                  />
                </div>

                <div>
                  <label htmlFor={nameInputId} className="block text-xs font-medium text-am-surface-300 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-am-surface-400" />
                    Nombre y Apellido
                  </label>
                  <input
                    id={nameInputId}
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-am-surface-900 border border-am-surface-700/80 text-white placeholder-am-surface-500 text-sm focus:outline-none focus:border-am-primary-400 focus:ring-1 focus:ring-am-primary-400 transition"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={phoneInputId} className="block text-xs font-medium text-am-surface-300 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-am-surface-400" />
                  Celular / WhatsApp (recibirás la receta aquí)
                </label>
                <input
                  id={phoneInputId}
                  type="tel"
                  required
                  placeholder="Ej. +54 9 11 2345-6789"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-am-surface-900 border border-am-surface-700/80 text-white placeholder-am-surface-500 text-sm focus:outline-none focus:border-am-primary-400 focus:ring-1 focus:ring-am-primary-400 transition"
                />
              </div>

              <div>
                <label htmlFor={reasonInputId} className="block text-xs font-medium text-am-surface-300 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-am-surface-400" />
                  Motivo o Medicamento Solicitado
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setFormData({ ...formData, reason: r })}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                        formData.reason === r
                          ? 'bg-am-primary-500/20 border-am-primary-400 text-am-primary-200'
                          : 'bg-am-surface-900/60 border-am-surface-700/60 text-am-surface-300 hover:border-am-surface-500'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <textarea
                  id={reasonInputId}
                  rows={2}
                  required
                  placeholder="Describe brevemente qué necesitas o el síntoma que presentas..."
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-am-surface-900 border border-am-surface-700/80 text-white placeholder-am-surface-500 text-sm focus:outline-none focus:border-am-primary-400 focus:ring-1 focus:ring-am-primary-400 transition resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-am-primary-600 to-emerald-600 hover:from-am-primary-500 hover:to-emerald-500 active:scale-[0.99] transition shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Conectando con guardia médica...</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4" />
                      <span>Solicitar Médico de Guardia Ahora</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              </div>

              <p className="text-[10px] text-center text-am-surface-400 pt-1">
                Al solicitar la consulta aceptas la atención bajo la Ley de Telemedicina y firma digital de prescripciones con validez oficial.
              </p>
            </form>
          </div>
        )}

        {/* STEP: WAITING */}
        {step === 'WAITING' && (
          <div className="w-full rounded-3xl border border-am-surface-700/60 bg-am-surface-800/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-black/50 text-center flex flex-col items-center">
            {/* Animated Radar Pulse */}
            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-am-primary-500/30 animate-pulse" />
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-am-primary-600 to-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-950/60 relative z-10">
                <Activity className="w-7 h-7 text-white animate-pulse" />
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-700/50 text-emerald-400 text-xs font-semibold mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Guardia Médica Asignando Profesional
            </span>

            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
              Estás en Sala de Espera Exprés
            </h2>
            <p className="text-sm text-am-surface-300 max-w-sm mb-6">
              Por favor aguarda unos instantes frente a la pantalla. La videollamada comenzará automáticamente en cuanto el médico tome tu consulta.
            </p>

            <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-6">
              <div className="p-3.5 rounded-2xl bg-am-surface-900 border border-am-surface-700/60 flex flex-col items-center">
                <span className="text-[11px] text-am-surface-400 flex items-center gap-1 mb-1">
                  <User className="w-3 h-3 text-am-surface-400" /> Posición en cola
                </span>
                <span className="text-xl font-bold text-white">
                  #{requestStatus?.queuePosition ?? 1}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-am-surface-900 border border-am-surface-700/60 flex flex-col items-center">
                <span className="text-[11px] text-am-surface-400 flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3 text-am-surface-400" /> Espera estimada
                </span>
                <span className="text-xl font-bold text-emerald-400">
                  ~1-3 min
                </span>
              </div>
            </div>

            <div className="w-full max-w-md p-3.5 rounded-2xl bg-am-surface-900/80 border border-am-surface-700/40 text-left text-xs text-am-surface-300 space-y-1.5 mb-6">
              <div className="flex justify-between">
                <span className="text-am-surface-400">Paciente:</span>
                <strong className="text-white">{formData.name} (DNI {formData.dni})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-am-surface-400">Farmacia:</span>
                <span className="text-white">{pharmacyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-am-surface-400">Motivo:</span>
                <span className="text-am-primary-300 truncate max-w-[200px]">{formData.reason}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => requestId && void checkStatus(requestId)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-am-surface-700/60 hover:bg-am-surface-700 text-xs font-medium text-am-surface-200 transition flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Actualizar
              </button>
              <button
                type="button"
                onClick={handleCancelRequest}
                className="py-2.5 px-3 rounded-xl bg-rose-950/30 hover:bg-rose-950/50 border border-rose-800/40 text-xs font-medium text-rose-300 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* STEP: ENDED */}
        {step === 'ENDED' && (
          <div className="w-full rounded-3xl border border-am-surface-700/60 bg-am-surface-800/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-black/50 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
              Atención Médica Concluida
            </h2>
            <p className="text-sm text-am-surface-300 max-w-sm mb-6">
              Tu consulta fue finalizada con éxito. Si el médico te prescribió medicamentos, recibirás la receta digital con firma electrónica en tu WhatsApp registrado y podrás retirarla directamente en este mostrador.
            </p>
            <button
              type="button"
              onClick={() => {
                setFormData({ dni: '', name: '', phone: '', reason: '' })
                setStep('FORM')
              }}
              className="py-2.5 px-6 rounded-xl bg-am-primary-600 hover:bg-am-primary-500 text-white font-medium text-xs transition"
            >
              Iniciar otra consulta
            </button>
          </div>
        )}

        {/* STEP: CANCELLED */}
        {step === 'CANCELLED' && (
          <div className="w-full rounded-3xl border border-am-surface-700/60 bg-am-surface-800/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-black/50 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-am-surface-700/40 flex items-center justify-center text-am-surface-400 mb-4">
              <XCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Consulta Cancelada
            </h2>
            <p className="text-sm text-am-surface-400 max-w-xs mb-6">
              La solicitud fue dada de baja de la cola de guardia.
            </p>
            <button
              type="button"
              onClick={() => setStep('FORM')}
              className="py-2.5 px-6 rounded-xl bg-am-surface-700 hover:bg-am-surface-600 text-white font-medium text-xs transition"
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
