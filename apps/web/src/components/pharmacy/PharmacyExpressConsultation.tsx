'use client'
import { useState, useEffect, useCallback, useId, type FormEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Phone,
  User,
  Video,
  XCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import type { DispatchRequest } from '@/lib/pharmacy/pharmacy-on-demand.service'
import GuestCallPage from '@/components/calls/GuestCallPage'
import { JordanPaymentWidget } from './JordanPaymentWidget'
import { LiveMedicalPresenceRadar } from './LiveMedicalPresenceRadar'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'

interface PharmacyExpressConsultationProps {
  pharmacyId?: string | null
  pharmacyName?: string
  initialDni?: string
  initialCareCountry?: 'AR' | 'BR' | null
  referralCode?: string | null
  referralPartnerName?: string | null
  jordanPaymentsEnabled?: boolean
  pharmacyPaymentsEnabled?: boolean
}

type Step = 'FORM' | 'WAITING' | 'CALL' | 'ENDED' | 'CANCELLED'

const COPY = {
  AR: { brand: 'Consulta médica', ready: 'Médico conectado', restart: 'Nueva consulta', country: 'País de atención', document: 'DNI', name: 'Nombre y apellido', phone: 'WhatsApp', reason: 'Motivo', nameExample: 'Ej. Juan Pérez', phoneExample: 'Ej. 11 2345-6789', reasonExample: 'Describí brevemente el motivo', submit: 'Continuar', submitting: 'Conectando...', searching: 'Buscando médico', elapsed: 'Tiempo', patient: 'Paciente', reasonLabel: 'Motivo', cancel: 'Cancelar', ended: 'Consulta finalizada', endedHint: 'La consulta terminó.', cancelled: 'Consulta cancelada', back: 'Volver' },
  BR: { brand: 'Consulta médica de plantão', ready: 'Médico conectado', restart: 'Nova consulta', country: 'País de atendimento', document: 'CPF', name: 'Nome completo', phone: 'WhatsApp', reason: 'Motivo', nameExample: 'Ex.: João da Silva', phoneExample: 'Ex.: (51) 99999-9999', reasonExample: 'Descreva o motivo em poucas palavras', submit: 'Iniciar consulta', submitting: 'Conectando...', searching: 'Buscando médico',  elapsed: 'Tempo', patient: 'Paciente', reasonLabel: 'Motivo', cancel: 'Cancelar', ended: 'Consulta finalizada', endedHint: 'A consulta foi concluída.', cancelled: 'Consulta cancelada', back: 'Voltar' },
} as const

const QUICK_REASONS = [
  'Dolor / malestar',
  'Receta',
  'Otro motivo',
] as const

export function PharmacyExpressConsultation({
  pharmacyId = null,
  pharmacyName = 'Punto de Farmacia',
  referralPartnerName = null,
  initialDni = '',
  initialCareCountry = null,
  referralCode = null,
  jordanPaymentsEnabled = false,
  pharmacyPaymentsEnabled = false,
}: PharmacyExpressConsultationProps) {
  const dniInputId = useId()
  const nameInputId = useId()
  const phoneInputId = useId()
  const reasonInputId = useId()
  const isJordanReferral = referralCode?.toUpperCase() === 'JORDAN'

  const [step, setStep] = useState<Step>('FORM')
  const [formData, setFormData] = useState({
    careCountry: (initialCareCountry ?? (isJordanReferral ? 'BR' : '')) as '' | 'AR' | 'BR',
    dni: initialDni,
    name: '',
    phone: '',
    reason: '',
  })
  const [reasonCategory, setReasonCategory] = useState<'pain' | 'prescription' | 'other' | ''>('')
  const [waitingSeconds, setWaitingSeconds] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Active request state (Gen 2: pharmacy_dispatch_requests)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [callRoomId, setCallRoomId] = useState<string | null>(null)
  const [brazilPaymentApproved, setBrazilPaymentApproved] = useState(false)
  const [onlineDoctorCount, setOnlineDoctorCount] = useState<number | null>(null)

  useEffect(() => {
    if (isJordanReferral) {
      setFormData((current) => ({ ...current, careCountry: 'BR' }))
      return
    }
    const browserIsPortuguese =
      (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt')) ||
      (typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('pt'))
    if (browserIsPortuguese) setFormData((current) => ({ ...current, careCountry: 'BR' }))
  }, [isJordanReferral])

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem('autamedica:pharmacy-express:active-session')
      if (!raw) return
      const saved = JSON.parse(raw) as { requestId?: string; guestToken?: string; careCountry?: 'AR' | 'BR' }
      if (!saved.requestId || !saved.guestToken || (saved.careCountry !== 'AR' && saved.careCountry !== 'BR')) return
      setRequestId(saved.requestId)
      setAccessToken(saved.guestToken)
      setFormData((current) => ({ ...current, careCountry: isJordanReferral ? 'BR' : saved.careCountry! }))
      setStep('WAITING')
    } catch {
      window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session')
    }
  }, [isJordanReferral])

  const isPortuguese = formData.careCountry === 'BR'
  const copy = isPortuguese ? COPY.BR : COPY.AR
  const selectedReason = reasonCategory === 'pain' ? (isPortuguese ? 'Dor / mal-estar' : 'Dolor / malestar') : reasonCategory === 'prescription' ? (isPortuguese ? 'Receita' : 'Receta') : reasonCategory === 'other' ? (isPortuguese ? 'Outro motivo' : 'Otro motivo') : ''
  const reasonSummary = [selectedReason, formData.reason.trim()].filter(Boolean).join(': ')
  const reasonOptions = isPortuguese
    ? [
        { value: 'pain' as const, label: 'Dor / mal-estar' },
        { value: 'prescription' as const, label: 'Receita' },
        { value: 'other' as const, label: 'Outro motivo' },
      ]
    : [
        { value: 'pain' as const, label: QUICK_REASONS[0] },
        { value: 'prescription' as const, label: QUICK_REASONS[1] },
        { value: 'other' as const, label: QUICK_REASONS[2] },
      ]

  // Country-scoped privacy-safe availability aggregate, shared with Kotlin.
  useEffect(() => {
    const active = step === 'WAITING' &&
      (formData.careCountry === 'AR' || formData.careCountry === 'BR') &&
      (formData.careCountry !== 'BR' || brazilPaymentApproved)
    if (!active) { setOnlineDoctorCount(null); return }
    let current = true
    const refresh = async () => {
      try {
        const client = getBrowserSupabaseClient() as unknown as {
          rpc: (name: string, args: { p_care_country: 'AR' | 'BR' }) => Promise<{ data: unknown; error: unknown }>
        }
        const { data, error } = await client.rpc('get_country_on_duty_capacity', {
          p_care_country: formData.careCountry as 'AR' | 'BR',
        })
        if (error) throw error
        if (!current) return
        const count = typeof data === 'number' ? data : typeof data === 'string' ? Number(data) : Number.NaN
        setOnlineDoctorCount(Number.isSafeInteger(count) && count >= 0 ? count : null)
      } catch { if (current) setOnlineDoctorCount(null) }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    return () => { current = false; window.clearInterval(timer) }
  }, [step, formData.careCountry, brazilPaymentApproved])

  useEffect(() => {
    if (step !== 'WAITING' || (formData.careCountry === 'BR' && !brazilPaymentApproved)) { setWaitingSeconds(0); return }
    const timer = window.setInterval(() => setWaitingSeconds((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [step, formData.careCountry, brazilPaymentApproved])

  // Polling / escucha para consultar GET /api/pharmacy/dispatch/${requestId}?token=${accessToken}
  const checkStatus = useCallback(async (id: string, token: string | null) => {
    try {
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
      const data = await fetchApi<{
        request: DispatchRequest
        doctor: {
          full_name: string
          license_number: string
          specialty: string
        } | null
      }>(`/api/pharmacy/dispatch/${encodeURIComponent(id)}${tokenParam}`)

      const req = data?.request
      if (!req) return

      // `assigned` no pertenece al enum `dispatch_request_status` de la tabla
      // `pharmacy_dispatch_requests` (ver #530). La comparacion era codigo muerto
      // y rompia el typecheck. `matched` es el estado real de asignacion.
      if (req.status === 'matched' || req.status === 'in_call') {
        const roomId = req.cloudflare_room_id || callRoomId
        if (roomId) {
          setCallRoomId(roomId)
          if (token && typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.searchParams.set('token', token)
            window.history.replaceState(null, '', url.toString())
          }
          setStep('CALL')
        }
      } else if (req.status === 'completed') {
        window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session')
        setStep('ENDED')
      } else if (req.status === 'cancelled' || req.status === 'expired') {
        window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session')
        setStep('CANCELLED')
      }
    } catch {
      // Ignorar fallas transitorias de red durante polling
    }
  }, [callRoomId])

  useEffect(() => {
    if (step !== 'WAITING' || !requestId) return

    // Chequeo inmediato
    void checkStatus(requestId, accessToken)

    const interval = setInterval(() => {
      void checkStatus(requestId, accessToken)
    }, 3000)

    return () => clearInterval(interval)
  }, [step, requestId, accessToken, checkStatus])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!pharmacyPaymentsEnabled) {
      setFormError(isPortuguese ? 'Os pagamentos da Consulta Expressa estão desativados.' : 'Los pagos de Consulta Exprés están desactivados.')
      return
    }
    if (!formData.careCountry) {
      setFormError(isPortuguese ? 'Escolha Argentina ou Brasil para continuar.' : 'Elegí Argentina o Brasil para continuar.')
      return
    }
    if (isJordanReferral && formData.careCountry !== 'BR') {
      setFormError(isPortuguese ? 'O canal Jordan atende exclusivamente no Brasil.' : 'El canal Jordan atiende exclusivamente en Brasil.')
      return
    }
    if (isJordanReferral && !jordanPaymentsEnabled) {
      setFormError(isPortuguese ? 'Este canal ainda não está disponível para atendimento.' : 'Este canal todavía no está disponible para atención.')
      return
    }
    const documentNumber = formData.dni.replace(/\D/g, '')
    if (formData.careCountry === 'BR' ? documentNumber.length !== 11 : documentNumber.length < 5 || documentNumber.length > 10) {
      setFormError(formData.careCountry === 'BR' ? 'Digite um CPF com 11 dígitos.' : 'Ingresá un DNI válido.')
      return
    }
    if (!formData.name.trim() || formData.name.trim().length < 3) {
      setFormError(isPortuguese ? 'Digite seu nome completo.' : 'Ingresá tu nombre y apellido completos.')
      return
    }
    if (!formData.phone.trim() || formData.phone.trim().length < 6) {
      setFormError(isPortuguese ? 'Digite um telefone ou WhatsApp válido.' : 'Ingresá un teléfono o WhatsApp válido.')
      return
    }
    if (!reasonCategory && !formData.reason.trim()) {
      setFormError(isPortuguese ? 'Informe o motivo da consulta.' : 'Indicá el motivo de consulta.')
      return
    }

    try {
      setSubmitting(true)

      // Consumir el motor Gen 2 (POST /api/pharmacy/dispatch/request)
      const res = await fetchApi<{
        request: DispatchRequest
        cloudflare_room_id: string
        accessToken: string
      }>('/api/pharmacy/dispatch/request', {
        method: 'POST',
        body: {
          careCountry: formData.careCountry,
          ...(formData.careCountry === 'BR' ? { patientCpf: documentNumber } : { patientDni: documentNumber }),
          patientName: formData.name.trim(),
          patientPhone: formData.phone.trim(),
          symptomSummary: reasonSummary,
          pharmacyId: pharmacyId || undefined,
          referralCode: referralCode || undefined,
          tier: 'general',
        },
      })

      const reqId = res.request.id
      const token = res.accessToken
      const roomId = res.cloudflare_room_id || res.request.cloudflare_room_id

      setRequestId(reqId)
      setAccessToken(token)
      setCallRoomId(roomId)
      window.sessionStorage.setItem('autamedica:pharmacy-express:active-session', JSON.stringify({ requestId: reqId, guestToken: token, careCountry: formData.careCountry }))
      setStep('WAITING')
    } catch {
      setFormError(isPortuguese ? 'Não foi possível iniciar a consulta. Tente novamente.' : 'No pudimos iniciar la consulta. Volvé a intentar.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelRequest = async () => {
    if (!requestId || !accessToken) {
      setFormError(isPortuguese ? 'Não foi possível cancelar sem autorização.' : 'No se puede cancelar sin autorización de esta consulta.')
      return
    }
    try {
      const result = await fetchApi<{ cancelled: boolean }>(
        `/api/pharmacy/dispatch/${encodeURIComponent(requestId)}`,
        {
          method: 'DELETE',
          headers: { 'x-guest-token': accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, guestRecoveryCredential: accessToken }),
        },
      )
      if (!result.cancelled) {
        setFormError(isPortuguese ? 'A consulta já foi atribuída ou não pôde ser cancelada.' : 'La consulta ya fue asignada o no pudo cancelarse.')
        return
      }
      window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session')
      setStep('CANCELLED')
    } catch {
      setFormError(isPortuguese ? 'Não foi possível cancelar a solicitação. Tente novamente.' : 'No pudimos cancelar la solicitud. Volvé a intentar.')
    }
  }

  // 1. STEP: CALL
  if (step === 'CALL' && callRoomId) {
    const requiresBrazilPayment = formData.careCountry === 'BR'
    return (
      <div className="w-full h-full min-h-[100dvh] bg-slate-50">
        <div className="fixed top-3 left-4 z-50 flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-200 shadow-lg text-xs font-medium text-slate-900">
          <img src="/logo_bioceramic.png" alt="AutaMedica" className="w-5 h-5 rounded-md object-contain" />
          <span className="font-bold tracking-tight text-slate-900">{pharmacyName || copy.brand}</span>
          {referralPartnerName && <span className="hidden text-slate-500 sm:inline">· {referralPartnerName}</span>}
          <span className="text-slate-400">•</span>
          <span className="text-emerald-700 flex items-center gap-1.5 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            {copy.ready}
          </span>
          <span className="text-slate-400 hidden sm:inline">•</span>
        </div>
        {(!requiresBrazilPayment || brazilPaymentApproved) && <GuestCallPage roomId={callRoomId} language={isPortuguese ? 'pt' : 'es'} />}
        {requiresBrazilPayment && requestId && accessToken && (
          <JordanPaymentWidget
            dispatchId={requestId}
            guestToken={accessToken}
            onStatusChange={(status) => setBrazilPaymentApproved(status === 'approved')}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-3 sm:p-5 relative font-sans overflow-x-hidden">

      <div className="w-full max-w-xl flex flex-col items-center relative z-10 my-auto">
        <header className="mb-5 flex items-center justify-center gap-2.5 text-center">
          <img src="/logo_bioceramic.png" alt="AutaMedica" className="h-9 w-9 object-contain" />
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {isPortuguese ? 'Consulta médica de plantão' : 'Consulta médica'}
          </h1>
        </header>
        {/* STEP: FORM */}
        {step === 'FORM' && (
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">

            {formError && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {!isJordanReferral && <fieldset className="grid grid-cols-2 gap-2">
                <legend className="mb-2 text-xs font-medium text-slate-600">{copy.country}</legend>
                {(['BR', 'AR'] as const).map((country) => {
                  const disabled = isJordanReferral && country === 'AR'
                  const selected = formData.careCountry === country
                  return (
                    <label key={country} className={selected ? 'flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#0EA5E9] bg-sky-50 px-3 text-sm font-medium text-sky-800' : 'flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700'}>
                      <input type="radio" name="careCountry" required checked={selected} disabled={disabled} onChange={() => { setFormData({ ...formData, careCountry: country, dni: '', reason: '' }); setReasonCategory('') }} className="sr-only" />
                      <span aria-hidden="true">{country === 'BR' ? '🇧🇷' : '🇦🇷'}</span>
                      <span>{country === 'BR' ? 'Brasil' : 'Argentina'}</span>
                    </label>
                  )
                })}
              </fieldset>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={dniInputId} className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {copy.document}
                  </label>
                  <input
                    id={dniInputId}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    placeholder={isPortuguese ? '123.456.789-09' : '35.123.456'}
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    className="min-h-12 w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-base focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition"
                  />
                </div>

                <div>
                  <label htmlFor={nameInputId} className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {copy.name}
                  </label>
                  <input
                    id={nameInputId}
                    type="text"
                    required
                    placeholder={copy.nameExample}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="min-h-12 w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-base focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={phoneInputId} className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  {copy.phone}
                </label>
                <input
                  id={phoneInputId}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder={copy.phoneExample}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="min-h-12 w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-base focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition"
                />
              </div>

              <div>
                <label htmlFor={reasonInputId} className="mb-1.5 block text-xs font-medium text-slate-600">{copy.reason}</label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {reasonOptions.map(({ value, label }) => {
                    const selected = reasonCategory === value
                    return <button key={value} type="button" aria-pressed={selected} onClick={() => { setReasonCategory(value); if (value !== 'other') setFormData((current) => ({ ...current, reason: '' })) }} className={selected ? 'min-h-11 rounded-lg border border-[#0EA5E9] bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800' : 'min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600'}>{label}</button>
                  })}
                </div>
                {reasonCategory === 'other' && <textarea
                  id={reasonInputId}
                  rows={2}
                  required
                  placeholder={copy.reasonExample}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="min-h-24 w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-base focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition resize-none"
                />}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-12 w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white bg-[#0EA5E9] hover:bg-sky-600 active:scale-[0.99] transition shadow-md shadow-sky-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{copy.submitting}</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4" />
                      <span>{copy.submit}</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        )}

        {/* STEP: WAITING */}
        {step === 'WAITING' && (
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm sm:p-5">
            {(formData.careCountry !== 'BR' || brazilPaymentApproved) && (
              <>
                <div className="mb-2 w-full"><LiveMedicalPresenceRadar onlineCount={onlineDoctorCount} isPortuguese={isPortuguese} /></div>
                <p className="mb-3 text-xs font-medium text-slate-600" aria-live="polite">{copy.searching}</p>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5"><span className="flex items-center justify-center gap-1 text-[11px] text-slate-500"><Clock className="h-3 w-3" />{copy.elapsed}</span><strong className="text-sm tabular-nums text-slate-800">{String(Math.floor(waitingSeconds / 60)).padStart(2, '0')}:{String(waitingSeconds % 60).padStart(2, '0')}</strong></div>
                </div>
              </>
            )}
            <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5 text-left text-xs"><p className="font-semibold text-slate-900">{copy.patient}: {formData.name}</p>{reasonSummary && <p className="mt-1 text-slate-600">{copy.reasonLabel}: {reasonSummary}</p>}</div>
            {formData.careCountry === 'BR' && requestId && accessToken && <div className="mb-4 w-full"><JordanPaymentWidget dispatchId={requestId} guestToken={accessToken} onStatusChange={(status) => setBrazilPaymentApproved(status === 'approved')} /></div>}
            <div className="flex items-center justify-center">
              <button type="button" onClick={handleCancelRequest} className="min-h-11 w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100">{copy.cancel}</button>
            </div>
          </div>
        )}
        {/* STEP: ENDED */}
        {step === 'ENDED' && (
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8 shadow-slate-200/70 text-center flex flex-col items-center">
            {/* Bioceramic Success Container */}
            <div className="relative w-16 h-16 rounded-[1.5rem] bg-white p-1 ring-1 ring-slate-200 shadow-lg flex items-center justify-center overflow-hidden mb-4">
              <img
                src="/logo_bioceramic.png"
                alt="AutaMedica"
                width={48}
                height={48}
                className="object-contain rounded-xl"
              />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white border-2 border-white shadow-md">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
              {copy.ended}
            </h2>
            <p className="text-sm text-slate-600 max-w-sm mb-6 leading-relaxed">
              {copy.endedHint}
            </p>
            <button
              type="button"
              onClick={() => {
                window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session')
                setRequestId(null)
                setAccessToken(null)
                setFormData({ careCountry: isJordanReferral ? 'BR' : '', dni: '', name: '', phone: '', reason: '' })
                setReasonCategory('')
                setStep('FORM')
              }}
              className="py-2.5 px-6 rounded-xl bg-[#0EA5E9] hover:bg-sky-600 text-white font-medium text-xs transition"
            >
              {copy.restart}
            </button>
          </div>
        )}

        {/* STEP: CANCELLED */}
        {step === 'CANCELLED' && (
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8 shadow-slate-200/70 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-4">
              <XCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              {copy.cancelled}
            </h2>
            <p className="text-sm text-slate-600 max-w-xs mb-6">
              {isPortuguese ? 'A solicitação foi cancelada.' : 'La solicitud fue cancelada.'}
            </p>
            <button
              type="button"
              onClick={() => { window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session'); setRequestId(null); setAccessToken(null); setReasonCategory(''); setStep('FORM') }}
              className="py-2.5 px-6 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs transition"
            >
              {copy.back}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
