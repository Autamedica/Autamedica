'use client'
import { useState, useEffect, useCallback, useId, type FormEvent } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Phone,
  ShieldCheck,
  User,
  Video,
  XCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  FileCheck,
  Lock,
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
  AR: {brand:'AutaMedica Guardia',ready:'Ya podés ingresar',restart:'Iniciar otra consulta',footerNetwork:'Red de farmacias asociadas',country:'¿Dónde querés atenderte?',patientData:'Tus datos',name:'Nombre y apellido',phone:'Teléfono / WhatsApp',reason:'Motivo de consulta',paymentTitle:'Consulta médica · R$ 79,00',paymentHint:'Confirmá el pago de R$ 79,00 para iniciar la videoconsulta.',nameExample:'Ej. Juan Pérez',phoneExample:'Ej. +54 9 11 2345-6789',reasonExample:'Contanos brevemente qué necesitás o qué síntomas tenés...',submit:'Consultar médico',submitting:'Conectando con la guardia...',searching:'Buscando médico...',waiting:'Estás en la fila de atención',waitingIntro:'Estamos buscando un médico disponible para atender tu consulta en',paymentPending:'Pago pendiente',paymentWaiting:'Completá el pago. La búsqueda y asignación del médico comienzan cuando Mercado Pago confirma el cobro.',queue:'Posición en la fila',queuePending:'Por confirmar',estimate:'Tiempo estimado',estimateUnknown:'Variable',patient:'Paciente:',network:'Red médica:',reasonLabel:'Motivo:',refresh:'Actualizar',cancel:'Cancelar',ended:'Atención finalizada · AutaMedica',endedHint:'Tu consulta finalizó correctamente. Gracias por usar AutaMedica.',cancelled:'Consulta cancelada',back:'{copy.back}'},
  BR: {brand:'Plantão AutaMedica',ready:'Você já pode entrar',restart:'Iniciar outra consulta',footerNetwork:'Rede de farmácias parceiras',paymentTitle:'Consulta médica · R$ 79,00',paymentHint:'Confirme o pagamento de R$ 79,00 para iniciar a videochamada.',country:'Onde você quer atendimento?',patientData:'Seus dados',name:'Nome completo',phone:'Telefone / WhatsApp',reason:'Motivo da consulta',nameExample:'Ex. João da Silva',phoneExample:'Ex. +55 51 99999-9999',reasonExample:'Conte brevemente o que você precisa ou quais sintomas está sentindo...',submit:'Consultar médico',submitting:'Conectando ao plantão...',searching:'Procurando médico...',waiting:'Sua fila de atendimento',waitingIntro:'Estamos procurando um médico disponível para atender você em',paymentPending:'Pagamento pendente',paymentWaiting:'Conclua o pagamento. A busca e a designação do médico começam quando o Mercado Pago confirma a cobrança.',queue:'Posição na fila',queuePending:'A confirmar',estimate:'Tempo estimado',estimateUnknown:'Não estimado',patient:'Paciente:',network:'Rede médica:',reasonLabel:'Motivo:',refresh:'Atualizar',cancel:'Cancelar',ended:'Atendimento concluído · AutaMedica',endedHint:'Sua consulta foi concluída. Obrigado por usar a AutaMedica.',cancelled:'Consulta cancelada',back:'Voltar ao início'},
} as const

const QUICK_REASONS = [
  'Renovación de receta crónica',
  'Alergia / antihistamínico',
  'Molestia gastrointestinal',
  'Dolor muscular / analgésico',
  'Síntomas respiratorios leves',
  'Otro medicamento',
] as const

export function PharmacyExpressConsultation({
  pharmacyId = null,
  pharmacyName = 'Farmacia Adherida',
  initialDni = '',
  initialCareCountry = null,
  referralCode = null,
  referralPartnerName = null,
  jordanPaymentsEnabled = false,
  pharmacyPaymentsEnabled = false,
}: PharmacyExpressConsultationProps) {
  const dniInputId = useId()
  const nameInputId = useId()
  const phoneInputId = useId()
  const reasonInputId = useId()

  const [step, setStep] = useState<Step>('FORM')
  const [formData, setFormData] = useState({
    careCountry: (initialCareCountry ?? (referralCode === 'JORDAN' ? 'BR' : '')) as '' | 'AR' | 'BR',
    dni: initialDni,
    name: '',
    phone: '',
    reason: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Active request state (Gen 2: pharmacy_dispatch_requests)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [callRoomId, setCallRoomId] = useState<string | null>(null)
  const [brazilPaymentApproved, setBrazilPaymentApproved] = useState(false)
  const [onlineDoctorCount, setOnlineDoctorCount] = useState<number | null>(null)
  const isPortuguese = formData.careCountry === 'BR'
  const copy = isPortuguese ? COPY.BR : COPY.AR

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
        setStep('ENDED')
      } else if (req.status === 'cancelled' || req.status === 'expired') {
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
      setFormError('Los pagos de Consulta Exprés están desactivados por la administración.')
      return
    }
    if (!formData.careCountry) {
      setFormError('Seleccioná el país donde recibirás atención: Argentina o Brasil.')
      return
    }
    if (referralCode === 'JORDAN' && formData.careCountry !== 'BR') {
      setFormError('O canal Jordan atende exclusivamente no Brasil.')
      return
    }
    if (referralCode === 'JORDAN' && !jordanPaymentsEnabled) {
      setFormError('Este canal ainda não está disponível para atendimento. Nenhuma cobrança será feita.')
      return
    }
    const documentNumber = formData.dni.replace(/\D/g, '')
    if (formData.careCountry === 'BR' ? documentNumber.length !== 11 : documentNumber.length < 5 || documentNumber.length > 10) {
      setFormError(formData.careCountry === 'BR' ? 'Ingresá un CPF de 11 dígitos.' : 'Ingresá un DNI válido.')
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
          symptomSummary: formData.reason.trim(),
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
      setStep('WAITING')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con la guardia médica'
      setFormError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelRequest = async () => {
    if (!requestId || !accessToken) {
      setFormError('No se puede cancelar sin autorización de esta consulta.')
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
        setFormError('La consulta ya fue asignada o no pudo cancelarse.')
        return
      }
      setStep('CANCELLED')
    } catch {
      setFormError('No se pudo cancelar la solicitud. Volvé a intentar.')
    }
  }

  // 1. STEP: CALL
  if (step === 'CALL' && callRoomId) {
    const requiresBrazilPayment = formData.careCountry === 'BR'
    return (
      <div className="w-full h-full min-h-[100dvh] bg-slate-50">
        <div className="fixed top-3 left-4 z-50 flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-200 shadow-lg text-xs font-medium text-slate-900">
          <img src="/logo_bioceramic.png" alt="AutaMedica" className="w-5 h-5 rounded-md object-contain" />
          <span className="font-bold tracking-tight text-slate-900">{copy.brand}</span>
          <span className="text-zinc-500">•</span>
          <span className="text-emerald-400 flex items-center gap-1.5 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Guardia Exprés
          </span>
          <span className="text-slate-400 hidden sm:inline">•</span>
          <span className="text-slate-600 hidden sm:inline font-normal">{referralPartnerName ?? pharmacyName}</span>
        </div>
        {(!requiresBrazilPayment || brazilPaymentApproved) && <GuestCallPage roomId={callRoomId} />}
        {requiresBrazilPayment && !brazilPaymentApproved && (
          <div className="min-h-[100dvh] flex items-center justify-center p-6 text-center text-white">
            <div className="max-w-md">
              <h2 className="text-xl font-semibold text-slate-900">{copy.paymentTitle}</h2>
              <p className="mt-3 text-sm text-zinc-300">
                Confirme o pagamento de R$ 79,00 para iniciar a videochamada com o médico.
              </p>
            </div>
          </div>
        )}
        {requiresBrazilPayment && requestId && accessToken && (
          <JordanPaymentWidget
            dispatchId={requestId}
            guestToken={accessToken}
            sourceLabel={referralPartnerName ?? 'Farmacia Express'}
            onStatusChange={(status) => setBrazilPaymentApproved(status === 'approved')}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 relative select-none font-sans overflow-x-hidden">

      <div className="w-full max-w-xl flex flex-col items-center relative z-10 my-auto">
        {/* Brand & Pharmacy Header */}
        <header className="flex flex-col items-center text-center mb-6">
          {/* Official Bioceramic Jewel / Ring Container */}
          <div className="relative w-16 h-16 rounded-[1.75rem] bg-white p-1 ring-1 ring-slate-200 shadow-lg flex items-center justify-center overflow-hidden mb-3.5 group">
            <div className="absolute inset-0 bg-gradient-to-tr from-sky-100 via-transparent to-sky-50 opacity-80 transition-opacity group-hover:opacity-100" />
            <img
              src="/logo_bioceramic.png"
              alt="AutaMedica"
              width={52}
              height={52}
              className="relative z-10 object-contain rounded-2xl transition-transform duration-500 group-hover:scale-105"
            />
          </div>

          {/* Institutional Partnership Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-am-surface-800/90 border border-slate-200 text-xs font-medium mb-2 shadow-md">
            <span className="font-bold text-slate-900">{copy.brand}</span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-400 font-medium">{referralPartnerName ? 'Canal de referidos' : 'Red de Farmacias Asociadas'}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center justify-center gap-2">
            {isPortuguese ? 'Atendimento médico na sua farmácia' : 'Atención médica en tu farmacia'}
          </h1>

          <div className="flex items-center justify-center gap-2 mt-1.5 text-xs text-slate-600">
            <Building2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span>{referralPartnerName ? 'Origen de referencia: ' : 'Punto de Atención Digital: '}<strong className="text-slate-900 font-semibold">{referralPartnerName ?? pharmacyName}</strong></span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Atención médica por videollamada. La emisión de documentos depende del profesional y de las habilitaciones correspondientes a cada país.
          </p>
        </header>

        {/* STEP: FORM */}
        {step === 'FORM' && (
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/70">
            <div className="flex items-center justify-between border-b border-am-surface-700/50 pb-4 mb-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{isPortuguese ? 'Atendimento imediato · Rede médica AutaMedica' : 'Atención inmediata · Red médica AutaMedica'}</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">{isPortuguese ? 'Etapa 1 de 2' : 'Paso 1 de 2'}</span>
            </div>

            {formError && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset className="rounded-xl border border-slate-300 p-3">
                <legend className="text-xs font-medium text-slate-600 px-1">{copy.country}</legend>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-white">
                  {(['AR', 'BR'] as const).map((country) => (
                    <label key={country} className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="careCountry"
                        required
                        checked={formData.careCountry === country}
                        disabled={referralCode === 'JORDAN' && country === 'AR'}
                        onChange={() => setFormData({ ...formData, careCountry: country, dni: '' })}
                        className="accent-[#0EA5E9]"
                      />
                      {country === 'AR' ? 'Argentina · DNI' : 'Brasil · CPF'}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={dniInputId} className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {formData.careCountry === 'BR' ? 'CPF (11 dígitos)' : 'DNI / Documento'}
                  </label>
                  <input
                    id={dniInputId}
                    type="text"
                    required
                    placeholder={formData.careCountry === 'BR' ? 'Ej. 12345678909' : 'Ej. 35123456'}
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition"
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
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition"
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
                  required
                  placeholder={copy.phoneExample}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition"
                />
              </div>

              <div>
                <label htmlFor={reasonInputId} className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  {copy.reason}
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(isPortuguese ? ['Renovação de receita contínua','Alergia / anti-histamínico','Desconforto gastrointestinal','Dor muscular / analgésico','Sintomas respiratórios leves','Outro medicamento'] : QUICK_REASONS).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setFormData({ ...formData, reason: r })}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                        formData.reason === r
                          ? 'bg-sky-50 border-sky-400 text-sky-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-sky-400'
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
                  placeholder={copy.reasonExample}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white bg-[#0EA5E9] hover:bg-sky-600 active:scale-[0.99] transition shadow-md shadow-sky-200 flex items-center justify-center gap-2 disabled:opacity-50"
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

              <p className="text-[10px] text-center text-slate-500 pt-1">
                La atención y la eventual emisión de documentos dependen de la verificación profesional, del país elegido y de las integraciones habilitadas.
              </p>

              {/* Institutional Trust & Regulatory Seals */}
              <div className="pt-4 mt-2 border-t border-am-surface-700/50 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-am-surface-700/50">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold text-white">Consulta por Videollamada</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Atención remota con controles clínicos y de identidad</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-am-surface-700/50">
                  <FileCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold text-white">Documentación Médica</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Emisión sujeta a habilitación y validación según país</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-am-surface-700/50">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold text-white">Protección de Datos</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Acceso controlado a información clínica</p>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* STEP: WAITING */}
        {step === 'WAITING' && (
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/70 text-center flex flex-col items-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800 text-xs font-semibold mb-3">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
              {formData.careCountry === 'BR' && !brazilPaymentApproved ? copy.paymentPending : copy.searching}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
              {formData.careCountry === 'BR' && !brazilPaymentApproved ? (isPortuguese ? 'Confirme sua consulta' : 'Confirmá tu consulta') : copy.waiting}
            </h2>
            <p className="text-sm text-slate-600 max-w-sm mb-4">
              {formData.careCountry === 'BR' && !brazilPaymentApproved ? copy.paymentWaiting : <>{copy.waitingIntro} <strong className="text-slate-900">{referralPartnerName ?? pharmacyName}.</strong></>}
            </p>
            {(formData.careCountry !== 'BR' || brazilPaymentApproved) && (
              <div className="mb-5 w-full"><LiveMedicalPresenceRadar onlineCount={onlineDoctorCount} isPortuguese={isPortuguese} /></div>
            )}
            <div className="w-full max-w-xs grid grid-cols-2 gap-3 mb-6">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center">
                <span className="text-[11px] text-slate-500 flex items-center gap-1 mb-1"><User className="w-3.5 h-3.5" /> {copy.queue}</span>
                <span className="text-xl font-bold text-slate-900">{copy.queuePending}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center">
                <span className="text-[11px] text-slate-500 flex items-center gap-1 mb-1"><Clock className="w-3.5 h-3.5" /> {copy.estimate}</span>
                <span className="text-xl font-bold text-slate-700">{copy.estimateUnknown}</span>
              </div>
            </div>
            <div className="w-full max-w-md p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 space-y-1.5 mb-6">
              <div className="flex justify-between gap-3"><span>{copy.patient}</span><strong className="text-slate-900 text-right">{formData.name} ({formData.careCountry === 'BR' ? 'CPF' : 'DNI'} {formData.dni})</strong></div>
              <div className="flex justify-between gap-3"><span>{copy.network}</span><span className="text-slate-900 font-medium text-right">AutaMedica · {referralPartnerName ?? pharmacyName}</span></div>
              <div className="flex justify-between gap-3"><span>{copy.reasonLabel}</span><span className="text-sky-700 font-medium truncate max-w-[200px]">{formData.reason}</span></div>
            </div>
            {formData.careCountry === 'BR' && requestId && accessToken && (
              <div className="w-full min-h-24 mb-6">
                <JordanPaymentWidget dispatchId={requestId} guestToken={accessToken}
                  sourceLabel={referralPartnerName ?? 'Farmácia Express'}
                  onStatusChange={(status) => setBrazilPaymentApproved(status === 'approved')} />
              </div>
            )}
            <div className="flex items-center gap-3 w-full max-w-xs">
              <button type="button" onClick={() => requestId && void checkStatus(requestId, accessToken)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> {copy.refresh}
              </button>
              <button type="button" onClick={handleCancelRequest}
                className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-medium text-rose-700 transition">{copy.cancel}</button>
            </div>
          </div>
        )}
        {/* STEP: ENDED */}
        {step === 'ENDED' && (
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/70 text-center flex flex-col items-center">
            {/* Bioceramic Success Container */}
            <div className="relative w-16 h-16 rounded-[1.5rem] bg-white p-1 ring-1 ring-slate-200 shadow-lg flex items-center justify-center overflow-hidden mb-4">
              <img
                src="/logo_bioceramic.png"
                alt="AutaMedica"
                width={48}
                height={48}
                className="object-contain rounded-xl"
              />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white border-2 border-zinc-950 shadow-md">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
              {copy.ended}
            </h2>
            <p className="text-sm text-slate-600 max-w-sm mb-6 leading-relaxed">
              {copy.endedHint}
            </p>
            <button
              type="button"
              onClick={() => {
                setFormData({ careCountry: '', dni: '', name: '', phone: '', reason: '' })
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
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/70 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-am-surface-700/40 flex items-center justify-center text-slate-500 mb-4">
              <XCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {copy.cancelled}
            </h2>
            <p className="text-sm text-slate-600 max-w-xs mb-6">
              {isPortuguese ? 'A solicitação foi cancelada.' : 'La solicitud fue cancelada.'}
            </p>
            <button
              type="button"
              onClick={() => setStep('FORM')}
              className="py-2.5 px-6 rounded-xl bg-am-surface-700 hover:bg-am-surface-600 text-white font-medium text-xs transition"
            >
              {copy.back}
            </button>
          </div>
        )}

        {/* Official Institutional Footer */}
        <footer className="mt-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2 z-10 relative">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <img src="/logo_bioceramic.png" alt="AutaMedica" className="w-4 h-4 rounded object-contain opacity-80" />
            <span className="font-semibold text-slate-900">{copy.brand}</span>
            <span className="text-slate-400">•</span>
            <span>{copy.footerNetwork}</span>
          </div>
          <p className="text-[10px] text-slate-500 max-w-md leading-normal">
            {isPortuguese ? 'Atendimento médico digital com AutaMedica.' : 'Atención médica digital con AutaMedica.'}
          </p>
        </footer>
      </div>
    </div>
  )
}
