'use client'
import { useState, useEffect, useCallback, useId, useRef, type FormEvent } from 'react'
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
import { validCpf } from '@/lib/prescriptions/brazil/cpf'

interface PharmacyExpressConsultationProps {
  pharmacyId?: string | null
  pharmacyName?: string
  initialDni?: string
  initialCareCountry?: 'AR' | 'BR' | null
  uiLocale?: 'es' | 'pt'
  referralCode?: string | null
  qrSourceCode?: string | null
  referralPartnerName?: string | null
  jordanPaymentsEnabled?: boolean
  pharmacyPaymentsEnabled?: boolean
  pricingByCountry?: Partial<Record<'AR' | 'BR', {
    currency: 'ARS' | 'BRL'
    consultation_price_minor: number
    doctor_fee_minor: number
    partner_commission_minor: number
    require_payment_before_dispatch: boolean
  }>>
}

type Step = 'FORM' | 'WAITING' | 'CALL' | 'ENDED' | 'CANCELLED'

type EncounterDocument = {
  id: string; kind: 'memed' | 'core' | 'certificate'; title: string; provider: string;
  createdAt: string; status: string; verificationCode: string | null; downloadUrl: string;
}

const COPY = {
  AR: {
    brand: 'Consulta médica', ready: 'Médico conectado', connectingCall: 'Médico asignado · Conectando sala', restart: 'Nueva consulta', country: 'País de atención',
    document: 'DNI', name: 'Nombre y apellido', phone: 'WhatsApp', reason: 'Motivo',
    nameExample: 'Ej. Juan Pérez', phoneExample: 'Ej. 11 2345-6789', reasonExample: 'Describí brevemente el motivo',
    submit: 'Continuar', submitting: 'Conectando...', searching: 'Buscando médico', elapsed: 'Tiempo',
    patient: 'Paciente', reasonLabel: 'Motivo', cancel: 'Cancelar',
    cancelReady: 'La búsqueda local alcanzó 15 minutos. Podés cancelar la solicitud.',
    ended: 'Consulta finalizada', endedHint: 'La consulta terminó.', cancelled: 'Consulta cancelada', back: 'Volver',
    availabilityChecking: 'Comprobando médicos disponibles en Argentina…',
    availabilityUnavailable: 'No pudimos comprobar la disponibilidad ahora. Volvé a consultar antes de iniciar.',
    noDoctorsAvailable: 'En este momento no hay médicos disponibles en Argentina. Volvé a comprobar la disponibilidad más tarde.',
    doctorsAvailable: (count: number) => count === 1 ? 'Hay 1 médico disponible para atenderte.' : `Hay ${count} médicos disponibles para atenderte.`,
    retryAvailability: 'Volver a comprobar disponibilidad',
  },
  BR: {
    brand: 'Consulta médica de plantão', ready: 'Médico conectado', connectingCall: 'Médico designado · Conectando sala', restart: 'Nova consulta', country: 'País de atendimento',
    document: 'CPF', name: 'Nome completo', phone: 'WhatsApp', reason: 'Motivo',
    nameExample: 'Ex.: João da Silva', phoneExample: 'Ex.: (51) 99999-9999', reasonExample: 'Descreva o motivo em poucas palavras',
    submit: 'Iniciar consulta', submitting: 'Conectando...', searching: 'Buscando médico', elapsed: 'Tempo',
    patient: 'Paciente', reasonLabel: 'Motivo', cancel: 'Cancelar',
    cancelReady: 'A busca local completou 15 minutos. Você pode cancelar a solicitação.',
    ended: 'Consulta finalizada', endedHint: 'A consulta foi concluída.', cancelled: 'Consulta cancelada', back: 'Voltar',
    availabilityChecking: 'Verificando médicos disponíveis no Brasil…',
    availabilityUnavailable: 'Não foi possível confirmar a disponibilidade agora. Consulte novamente antes de iniciar.',
    noDoctorsAvailable: 'No momento não há médicos disponíveis no Brasil. Consulte a disponibilidade novamente mais tarde.',
    doctorsAvailable: (count: number) => count === 1 ? 'Há 1 médico disponível para atender você.' : `Há ${count} médicos disponíveis para atender você.`,
    retryAvailability: 'Verificar disponibilidade novamente',
  },
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
  qrSourceCode = null,
  jordanPaymentsEnabled = false,
  pharmacyPaymentsEnabled = false,
  pricingByCountry = {},
}: PharmacyExpressConsultationProps) {
  const dniInputId = useId()
  const nameInputId = useId()
  const phoneInputId = useId()
  const reasonInputId = useId()
  const isJordanReferral = referralCode?.toUpperCase() === 'JORDAN'
  const requiresAvailabilityPreflight = Boolean(qrSourceCode || referralCode || pharmacyId)

  const [step, setStep] = useState<Step>('FORM')
  const [formData, setFormData] = useState({
    careCountry: (initialCareCountry ?? '') as '' | 'AR' | 'BR',
    dni: initialDni,
    genderCode: '' as '' | 'F' | 'M' | 'X',
    name: '',
    phone: '',
    reason: '',
  })
  const [reasonCategory, setReasonCategory] = useState<'pain' | 'prescription' | 'other' | ''>('')
  const [waitingSeconds, setWaitingSeconds] = useState(0)
  const [waitingStartedAt, setWaitingStartedAt] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false)
  const [recoveryDocument, setRecoveryDocument] = useState('')
  const [recoveryPhone, setRecoveryPhone] = useState('')
  const [recoveringQueue, setRecoveringQueue] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  // Active request state (Gen 2: pharmacy_dispatch_requests)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
  const [callRoomId, setCallRoomId] = useState<string | null>(null)
  const [isCallMediaConnected, setIsCallMediaConnected] = useState(false)
  const [countryPaymentApproved, setCountryPaymentApproved] = useState(false)
  const [onDutyDoctorCount, setOnDutyDoctorCount] = useState<number | null>(null)
  const [availabilityChecked, setAvailabilityChecked] = useState(false)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0)
  const [documents, setDocuments] = useState<EncounterDocument[]>([])
  const recoveryInProgress = useRef(false)
  const lastRecoveryAttemptAt = useRef(0)

  useEffect(() => {
    let active = true
    const restore = async () => {
      const key = 'autamedica:pharmacy-express:active-session'
      try {
        const raw = window.sessionStorage.getItem(key) || window.localStorage.getItem(key)
        if (!raw) return
        const saved = JSON.parse(raw) as {
          requestId?: string; guestToken?: string; recoveryToken?: string;
          country?: 'AR' | 'BR'; careCountry?: 'AR' | 'BR';
          referralCode?: string | null; qrSourceCode?: string | null; partnerName?: string | null; paymentApproved?: boolean; savedAt?: number;
        }
        const country = saved.country ?? saved.careCountry
        if (!saved.requestId || !saved.recoveryToken || (country !== 'AR' && country !== 'BR')
          || !saved.savedAt || Date.now() - saved.savedAt > 12 * 60 * 60 * 1000) {
          window.sessionStorage.removeItem(key); window.localStorage.removeItem(key); return
        }
        const restored = await fetchApi<{ request: DispatchRequest; accessToken: string }>('/api/pharmacy/dispatch/resume', {
          method: 'POST', body: { requestId: saved.requestId, recoveryToken: saved.recoveryToken },
        })
        if (!active || !restored?.accessToken) return
        setRequestId(saved.requestId)
        setAccessToken(restored.accessToken)
        setRecoveryToken(saved.recoveryToken)
        setCallRoomId(restored.request.cloudflare_room_id)
        setWaitingStartedAt(restored.request.search_started_at ? Date.parse(restored.request.search_started_at) : null)
        setCountryPaymentApproved(saved.paymentApproved === true || restored.request.status !== 'pending_payment')
        if (restored.request.status === 'expired') setWaitingSeconds(15 * 60)
        setFormData((current) => ({ ...current, careCountry: country }))
        const next = { ...saved, guestToken: restored.accessToken, country, careCountry: country, savedAt: Date.now() }
        window.sessionStorage.setItem(key, JSON.stringify(next))
        window.localStorage.setItem(key, JSON.stringify(next))
        setStep(restored.request.status === 'in_call' ? 'CALL' : restored.request.status === 'completed' ? 'ENDED' : 'WAITING')
      } catch {
        // Retain the device-scoped backup after transient network failures.
      }
    }
    void restore()
    return () => { active = false }
  }, [isJordanReferral])

  // Care jurisdiction owns the language; a browser locale must never render
  // the Argentina clinical/payment flow in Portuguese.
  const isPortuguese = formData.careCountry === 'BR'
  const currentPricing = formData.careCountry ? pricingByCountry[formData.careCountry] : undefined
  const requiresCountryPayment = currentPricing?.require_payment_before_dispatch === true
  const amountLabel = currentPricing ? new Intl.NumberFormat(currentPricing.currency === 'BRL' ? 'pt-BR' : 'es-AR', { style: 'currency', currency: currentPricing.currency }).format(currentPricing.consultation_price_minor / 100) : null
  const copy = isPortuguese ? COPY.BR : COPY.AR
  // Civil document type is determined only by the selected clinical country.
  const documentLabel = formData.careCountry === 'BR' ? 'CPF' : 'DNI'
  const documentPlaceholder = formData.careCountry === 'BR' ? '123.456.789-09' : '35.123.456'
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

  // Use the same country-aware capacity RPC that powers the patient and doctor portals.
  // Verify capacity before creating a request or opening any checkout.
  useEffect(() => {
    const validCountry = formData.careCountry === 'AR' || formData.careCountry === 'BR'
    const shouldCheck = requiresAvailabilityPreflight && (step === 'FORM' || (step === 'WAITING' &&
      (!pricingByCountry[formData.careCountry as 'AR' | 'BR']?.require_payment_before_dispatch || countryPaymentApproved)))
      && validCountry

    if (!shouldCheck) {
      setOnDutyDoctorCount(null)
      setAvailabilityChecked(false)
      setAvailabilityLoading(false)
      return
    }

    let current = true
    const refresh = async () => {
      setAvailabilityLoading(true)
      try {
        const client = getBrowserSupabaseClient() as unknown as {
          rpc: (name: string, args: { p_care_country: 'AR' | 'BR' }) => Promise<{ data: unknown; error: unknown }>
        }
        const { data, error } = await client.rpc('get_country_on_duty_capacity', {
          p_care_country: formData.careCountry as 'AR' | 'BR',
        })
        if (error) throw error
        const count = typeof data === 'number' ? data : typeof data === 'string' ? Number(data) : Number.NaN
        if (!current) return
        setOnDutyDoctorCount(Number.isSafeInteger(count) && count >= 0 ? count : null)
      } catch {
        if (current) setOnDutyDoctorCount(null)
      } finally {
        if (current) {
          setAvailabilityChecked(true)
          setAvailabilityLoading(false)
        }
      }
    }

    setAvailabilityChecked(false)
    setOnDutyDoctorCount(null)
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [step, formData.careCountry, countryPaymentApproved, pricingByCountry, availabilityRefreshKey, requiresAvailabilityPreflight])

  useEffect(() => {
    if (step !== 'WAITING' || (requiresCountryPayment && !countryPaymentApproved) || waitingStartedAt === null) {
      setWaitingSeconds(0)
      return
    }
    const updateElapsed = () => setWaitingSeconds(Math.max(0, Math.floor((Date.now() - waitingStartedAt) / 1000)))
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [step, waitingStartedAt, countryPaymentApproved, requiresCountryPayment])

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
        documents?: EncounterDocument[]
      }>(`/api/pharmacy/dispatch/${encodeURIComponent(id)}${tokenParam}`)

      const req = data?.request
      if (!req) return
      if (Array.isArray(data.documents)) setDocuments(data.documents)
      if (req.search_started_at) setWaitingStartedAt(Date.parse(req.search_started_at))
      if (req.status === 'searching' || req.status === 'matched' || req.status === 'in_call' || req.status === 'expired') {
        setCountryPaymentApproved(true)
      }
      if (req.status === 'expired') setWaitingSeconds(15 * 60)

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
      } else if (req.status === 'searching') {
        setIsCallMediaConnected(false)
        setStep('WAITING')
      } else if (req.status === 'pending_payment') {
        if (!countryPaymentApproved) setCountryPaymentApproved(false)
        setStep('WAITING')
      } else if (req.status === 'completed') {
        setStep('ENDED')
      } else if (req.status === 'expired') {
        // Local search is complete; preserve the request so the patient can cancel.
        setStep('WAITING')
      } else if (req.status === 'cancelled') {
        window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session')
        window.localStorage.removeItem('autamedica:pharmacy-express:active-session')
        setStep('CANCELLED')
      }
    } catch {
      // Re-issue a short-lived room JWT with the device-scoped recovery secret
      // when the active guest token has expired or been rejected.
      if (recoveryInProgress.current || Date.now() - lastRecoveryAttemptAt.current < 15000) return
      recoveryInProgress.current = true
      lastRecoveryAttemptAt.current = Date.now()
      try {
        const key = 'autamedica:pharmacy-express:active-session'
        const raw = window.sessionStorage.getItem(key) || window.localStorage.getItem(key)
        const saved = raw ? JSON.parse(raw) as {
          requestId?: string; recoveryToken?: string; country?: 'AR' | 'BR';
          careCountry?: 'AR' | 'BR'; referralCode?: string | null;
          partnerName?: string | null; qrSourceCode?: string | null; savedAt?: number;
        } : null
        if (saved?.requestId !== id) return
        const secret = saved.recoveryToken || recoveryToken
        if (!secret) return
        const restored = await fetchApi<{ request: DispatchRequest; accessToken: string }>('/api/pharmacy/dispatch/resume', {
          method: 'POST',
          body: { requestId: id, recoveryToken: secret },
        })
        const country = saved?.country ?? saved?.careCountry ?? formData.careCountry
        const next = {
          requestId: id,
          guestToken: restored.accessToken,
          recoveryToken: secret,
          country,
          referralCode: saved?.referralCode ?? referralCode,
          qrSourceCode: saved?.qrSourceCode ?? qrSourceCode,
          partnerName: saved?.partnerName ?? referralPartnerName,
          savedAt: Date.now(),
        }
        setAccessToken(restored.accessToken)
        setRecoveryToken(secret)
        setCallRoomId(restored.request.cloudflare_room_id)
        setFormData((current) => ({ ...current, careCountry: country === 'BR' || country === 'AR' ? country : current.careCountry }))
        window.sessionStorage.setItem(key, JSON.stringify(next))
        window.localStorage.setItem(key, JSON.stringify(next))
        const url = new URL(window.location.href)
        url.searchParams.set('token', restored.accessToken)
        window.history.replaceState(null, '', url.toString())
        if (restored.request.status === 'in_call' || restored.request.status === 'matched') setStep('CALL')
        else if (restored.request.status === 'completed') setStep('ENDED')
        else setStep('WAITING')
      } catch {
        // Keep the recovery secret so the next healthy poll can retry.
      } finally {
        recoveryInProgress.current = false
      }
    }
  }, [callRoomId, recoveryToken, formData.careCountry, referralCode, qrSourceCode, referralPartnerName, countryPaymentApproved])

  useEffect(() => {
    if (step !== 'ENDED' || !requestId) return
    void checkStatus(requestId, accessToken)
  }, [step, requestId, accessToken, checkStatus])

  useEffect(() => {
    if ((step !== 'WAITING' && step !== 'CALL') || !requestId) return

    // Chequeo inmediato
    void checkStatus(requestId, accessToken)

    const interval = setInterval(() => {
      void checkStatus(requestId, accessToken)
    }, 3000)

    return () => clearInterval(interval)
  }, [step, requestId, accessToken, checkStatus])

  const handleRecoverQueue = async (event: FormEvent) => {
    event.preventDefault()
    if (!formData.careCountry) {
      setRecoveryError(isPortuguese ? 'Selecione o pa\u00EDs no formul\u00E1rio primeiro.' : 'Seleccion\u00E1 el pa\u00EDs en el formulario primero.')
      return
    }
    setRecoveringQueue(true)
    setRecoveryError(null)
    try {
      const recovered = await fetchApi<{
        requestId: string
        status: string
        guestToken: string
        recoveryToken: string
      }>('/api/pharmacy/dispatch/recover-queue', {
        method: 'POST',
        body: {
          document: recoveryDocument.replace(/\D/g, ''),
          phone: recoveryPhone.replace(/\D/g, ''),
        },
      })
      if (!recovered?.requestId || !recovered.guestToken || !recovered.recoveryToken) {
        throw new Error('queue_recovery_not_found')
      }
      const key = 'autamedica:pharmacy-express:active-session'
      const activeSession = {
        requestId: recovered.requestId,
        guestToken: recovered.guestToken,
        recoveryToken: recovered.recoveryToken,
        country: formData.careCountry,
        careCountry: formData.careCountry,
        referralCode,
        qrSourceCode,
        partnerName: referralPartnerName,
        paymentApproved: true,
        savedAt: Date.now(),
      }
      window.sessionStorage.setItem(key, JSON.stringify(activeSession))
      window.localStorage.setItem(key, JSON.stringify(activeSession))
      setRequestId(recovered.requestId)
      setAccessToken(recovered.guestToken)
      setRecoveryToken(recovered.recoveryToken)
      setWaitingStartedAt(Date.now())
      setCountryPaymentApproved(true)
      setFormData((current) => ({ ...current, dni: recoveryDocument, phone: recoveryPhone }))
      setRecoveryModalOpen(false)
      setStep('WAITING')
    } catch {
      setRecoveryError(isPortuguese
        ? 'N\u00E3o encontramos um atendimento pago ativo com esses dados'
        : 'No encontramos una consulta paga activa con esos datos')
    } finally {
      setRecoveringQueue(false)
    }
  }

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
    if (!currentPricing) {
      setFormError(isPortuguese ? 'A tarifa deste país ainda não está configurada.' : 'La tarifa de este país todavía no está configurada.')
      return
    }
    if (requiresAvailabilityPreflight && (!availabilityChecked || onDutyDoctorCount === null)) {
      setFormError(copy.availabilityUnavailable)
      return
    }
    if (requiresAvailabilityPreflight && onDutyDoctorCount !== null && onDutyDoctorCount < 1) {
      setFormError(copy.noDoctorsAvailable)
      return
    }
    if (formData.careCountry === 'BR' && !lgpdConsent) {
      setFormError('Ao continuar, você precisa aceitar os termos de teleconsulta e o tratamento de dados conforme a LGPD.')
      return
    }
    if (isJordanReferral && !jordanPaymentsEnabled) {
      setFormError(isPortuguese ? 'Este canal ainda não está disponível para atendimento.' : 'Este canal todavía no está disponible para atención.')
      return
    }
    const documentNumber = formData.dni.replace(/\D/g, '')
    if (formData.careCountry === 'BR' ? !validCpf(documentNumber) : documentNumber.length < 5 || documentNumber.length > 10) {
      setFormError(formData.careCountry === 'BR' ? 'Informe os 11 dígitos válidos do CPF.' : 'Ingresá un DNI válido.')
      return
    }
    if (formData.careCountry === 'AR' && !['F', 'M', 'X'].includes(formData.genderCode)) {
      setFormError('Seleccioná el sexo que figura en el DNI (F, M o X) para consultar RENAPER.');
      return;
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
      setCountryPaymentApproved(false)

      // Consumir el motor Gen 2 (POST /api/pharmacy/dispatch/request)
      const res = await fetchApi<{
        request: DispatchRequest
        cloudflare_room_id: string
        accessToken: string
        recoveryToken?: string
      }>('/api/pharmacy/dispatch/request', {
        method: 'POST',
        body: {
          careCountry: formData.careCountry,
          ...(formData.careCountry === 'BR' ? {
            patientCpf: documentNumber,
            lgpdConsent: true,
            telemedicineConsent: true,
          } : { patientDni: documentNumber, patientGenderCode: formData.genderCode }),
          patientName: formData.name.trim(),
          patientPhone: formData.phone.trim(),
          symptomSummary: reasonSummary,
          pharmacyId: pharmacyId || undefined,
          referralCode: referralCode || undefined,
          qrSourceCode: qrSourceCode || undefined,
          tier: 'general',
        },
      })

      const reqId = res.request.id
      const token = res.accessToken
      const roomId = res.cloudflare_room_id || res.request.cloudflare_room_id

      setRequestId(reqId)
      setAccessToken(token)
      setRecoveryToken(res.recoveryToken ?? null)
      setCallRoomId(roomId)
      setWaitingStartedAt(res.request.search_started_at ? Date.parse(res.request.search_started_at) : null)
      const activeSession = { requestId: reqId, guestToken: token, recoveryToken: res.recoveryToken ?? null, country: formData.careCountry, referralCode, qrSourceCode, partnerName: referralPartnerName, savedAt: Date.now() }
      window.sessionStorage.setItem('autamedica:pharmacy-express:active-session', JSON.stringify(activeSession))
      window.localStorage.setItem('autamedica:pharmacy-express:active-session', JSON.stringify(activeSession))
      setStep('WAITING')
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('no_doctors_available_now')) {
        setOnDutyDoctorCount(0)
        setAvailabilityChecked(true)
        setFormError(copy.noDoctorsAvailable)
      } else if (message.includes('doctor_availability_unavailable')) {
        setOnDutyDoctorCount(null)
        setAvailabilityChecked(true)
        setFormError(copy.availabilityUnavailable)
      } else {
        setFormError(isPortuguese ? 'Não foi possível iniciar a consulta. Tente novamente.' : 'No pudimos iniciar la consulta. Volvé a intentar.')
      }
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
      window.localStorage.removeItem('autamedica:pharmacy-express:active-session')
      setStep('CANCELLED')
    } catch {
      setFormError(isPortuguese ? 'Não foi possível cancelar a solicitação. Tente novamente.' : 'No pudimos cancelar la solicitud. Volvé a intentar.')
    }
  }

  // 1. STEP: CALL
  if (step === 'CALL' && callRoomId) {
    return (
      <div className="w-full h-full min-h-[100dvh] bg-slate-50">
        <div className="fixed top-3 left-4 z-50 flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-200 shadow-lg text-xs font-medium text-slate-900">
          <img src="/logo_bioceramic.png" alt="AutaMedica" className="w-5 h-5 rounded-md object-contain" />
          <span className="font-bold tracking-tight text-slate-900">{pharmacyName || copy.brand}</span>
          {referralPartnerName && <span className="hidden text-slate-500 sm:inline">· {referralPartnerName}</span>}
          <span className="text-slate-400">•</span>
          <span className={isCallMediaConnected ? 'text-emerald-700 flex items-center gap-1.5 font-semibold' : 'text-amber-700 flex items-center gap-1.5 font-semibold'}>
            <span className={isCallMediaConnected ? 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping' : 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse'} />
            {isCallMediaConnected ? copy.ready : copy.connectingCall}
          </span>
          <span className="text-slate-400 hidden sm:inline">•</span>
        </div>
        {(!requiresCountryPayment || countryPaymentApproved) && (
          <GuestCallPage
            roomId={callRoomId}
            dispatchId={requestId ?? undefined}
            guestToken={accessToken ?? undefined}
            language={isPortuguese ? 'pt' : 'es'}
            onConnectionChange={setIsCallMediaConnected}
          />
        )}
        {requiresCountryPayment && requestId && accessToken && currentPricing && (
          <JordanPaymentWidget
            dispatchId={requestId}
            guestToken={accessToken}
            currency={currentPricing.currency}
            amountMinor={currentPricing.consultation_price_minor}
            countryCode={formData.careCountry as 'AR' | 'BR'}
            onStatusChange={(status) => setCountryPaymentApproved(status === 'approved')}
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

            <div className="mb-4">
              <button type="button" onClick={() => {
                  if (!formData.careCountry) {
                    setFormError(isPortuguese ? 'Selecione o pa\u00EDs no formul\u00E1rio primeiro.' : 'Seleccion\u00E1 el pa\u00EDs en el formulario primero.')
                    return
                  }
                  setRecoveryError(null)
                  setRecoveryModalOpen(true)
                }}
                className="min-h-11 w-full rounded-xl border border-sky-400 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50">
                {isPortuguese ? 'J\u00E1 paguei \u00B7 Entrar na fila' : 'Ya pagu\u00E9 \u00B7 Entrar a la fila'}
              </button>
            </div>
            {recoveryModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true"
                aria-label={isPortuguese ? 'Recuperar fila' : 'Recuperar fila'}>
                <form onSubmit={handleRecoverQueue} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
                  <h2 className="text-base font-semibold text-slate-900">{isPortuguese ? 'Entrar na fila' : 'Entrar a la fila'}</h2>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">{documentLabel}</label>
                    <input autoFocus required inputMode="numeric" value={recoveryDocument}
                      onChange={(event) => setRecoveryDocument(event.target.value.replace(/\D/g, ''))}
                      className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">WhatsApp</label>
                    <input required type="tel" inputMode="tel" value={recoveryPhone}
                      onChange={(event) => setRecoveryPhone(event.target.value)}
                      className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
                  </div>
                  {recoveryError && <p role="alert" className="text-xs text-sky-700">{recoveryError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setRecoveryModalOpen(false)}
                      className="min-h-11 flex-1 rounded-xl border border-sky-300 px-3 text-sm font-medium text-sky-700">
                      {isPortuguese ? 'Cancelar' : 'Cancelar'}
                    </button>
                    <button type="submit" disabled={recoveringQueue || !recoveryDocument || !recoveryPhone.trim()}
                      className="min-h-11 flex-1 rounded-xl bg-sky-500 px-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50">
                      {recoveringQueue ? (isPortuguese ? 'Entrando...' : 'Ingresando...') : (isPortuguese ? 'Entrar na fila' : 'Entrar a la fila')}
                    </button>
                  </div>
                </form>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {!initialCareCountry && (
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="mb-2 text-xs font-medium text-slate-600">{copy.country}</legend>
                {(['BR', 'AR'] as const).map((country) => {
                  const selected = formData.careCountry === country
                  return (
                    <label key={country} className={selected ? 'flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#0EA5E9] bg-sky-50 px-3 text-sm font-medium text-sky-800' : 'flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700'}>
                      <input type="radio" name="careCountry" required checked={selected} onChange={() => { setFormData({ ...formData, careCountry: country, dni: '', reason: '' }); setReasonCategory(''); setLgpdConsent(false) }} className="sr-only" />
                      <span aria-hidden="true">{country === 'BR' ? '🇧🇷' : '🇦🇷'}</span>
                      <span>{country === 'BR' ? 'Brasil' : 'Argentina'}</span>
                    </label>
                  )
                })}
              </fieldset>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {formData.careCountry ? (
                <div>
                  <label htmlFor={dniInputId} className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {documentLabel}
                  </label>
                  <input
                    id={dniInputId}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    placeholder={documentPlaceholder}
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    className="min-h-12 w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-base focus:outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] transition"
                  />
                  {formData.careCountry === 'AR' && (
                    <div className="mt-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="pharmacy-express-renaper-sex">Sexo según DNI</label>
                      <select id="pharmacy-express-renaper-sex" required value={formData.genderCode}
                        onChange={(event) => setFormData({ ...formData, genderCode: event.target.value as '' | 'F' | 'M' | 'X' })}
                        className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                        <option value="">Seleccionar…</option><option value="F">F — Femenino</option><option value="M">M — Masculino</option><option value="X">X — No binario</option>
                      </select>
                    </div>
                  )}
                </div>
                ) : (
                  <p className="self-center text-sm text-slate-500">
                    {isPortuguese ? 'Selecione o país para informar o documento correto.' : 'Seleccioná el país para informar el documento correcto.'}
                  </p>
                )}

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

              {formData.careCountry === 'BR' && (
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                  <input type="checkbox" required checked={lgpdConsent}
                    onChange={(event) => setLgpdConsent(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600" />
                  <span>Autorizo a realização desta teleconsulta por meios digitais e concordo com o tratamento dos meus dados pessoais e de saúde para este atendimento, conforme a LGPD.</span>
                </label>
              )}
              {formData.careCountry && currentPricing && amountLabel && <div className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm"><span className="font-medium text-slate-700">{isPortuguese ? 'Valor da consulta' : 'Precio de la consulta'}</span><strong className="tabular-nums text-slate-900">{amountLabel}</strong></div>}
              {requiresAvailabilityPreflight && formData.careCountry && (
                <div role="status" aria-live="polite" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
                  <p className="font-medium">
                    {!availabilityChecked && availabilityLoading
                      ? copy.availabilityChecking
                      : onDutyDoctorCount === null
                        ? copy.availabilityUnavailable
                        : onDutyDoctorCount < 1
                          ? copy.noDoctorsAvailable
                          : copy.doctorsAvailable(onDutyDoctorCount)}
                  </p>
                  {(availabilityChecked && (onDutyDoctorCount === null || onDutyDoctorCount < 1)) && (
                    <button type="button" disabled={availabilityLoading} onClick={() => setAvailabilityRefreshKey((current) => current + 1)}
                      className="mt-2 min-h-10 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50">
                      {availabilityLoading ? copy.availabilityChecking : copy.retryAvailability}
                    </button>
                  )}
                </div>
              )}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || (requiresAvailabilityPreflight && (!availabilityChecked || onDutyDoctorCount === null || onDutyDoctorCount < 1))}
                  className="min-h-12 w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white bg-[#0EA5E9] hover:bg-[#0284C7] active:scale-[0.99] transition shadow-md shadow-sky-200 flex items-center justify-center gap-2 disabled:opacity-50"
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
            {(!requiresCountryPayment || countryPaymentApproved) && (
              <>
                <div className="mb-2 w-full"><LiveMedicalPresenceRadar onDutyCount={onDutyDoctorCount} isPortuguese={isPortuguese} /></div>
                <p className="mb-3 text-xs font-medium text-slate-600" aria-live="polite">{copy.searching}</p>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5"><span className="flex items-center justify-center gap-1 text-[11px] text-slate-500"><Clock className="h-3 w-3" />{copy.elapsed}</span><strong className="text-sm tabular-nums text-slate-800">{String(Math.floor(waitingSeconds / 60)).padStart(2, '0')}:{String(waitingSeconds % 60).padStart(2, '0')}</strong></div>
                </div>
              </>
            )}
            <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5 text-left text-xs"><p className="font-semibold text-slate-900">{copy.patient}: {formData.name}</p>{reasonSummary && <p className="mt-1 text-slate-600">{copy.reasonLabel}: {reasonSummary}</p>}</div>
            {requiresCountryPayment && requestId && accessToken && currentPricing && <div className="mb-4 w-full"><JordanPaymentWidget dispatchId={requestId} guestToken={accessToken} currency={currentPricing.currency} amountMinor={currentPricing.consultation_price_minor} countryCode={formData.careCountry as 'AR' | 'BR'} onStatusChange={(status) => setCountryPaymentApproved(status === 'approved')} /></div>}
            {(!requiresCountryPayment || countryPaymentApproved) && waitingSeconds >= 15 * 60 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600" role="status">{copy.cancelReady}</p>
                <div className="flex items-center justify-center">
                  <button type="button" onClick={handleCancelRequest} className="min-h-11 w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100">{copy.cancel}</button>
                </div>
              </div>
            )}
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
            <p className="text-sm text-slate-600 max-w-sm mb-5 leading-relaxed">
              {copy.endedHint}
            </p>
            <div className="mb-6 w-full space-y-3 text-left">
              {documents.length > 0 ? documents.map((document) => {
                const documentUrl = new URL(document.downloadUrl, window.location.origin).toString()
                const shareUrl = `https://wa.me/?text=${encodeURIComponent(`${document.title} · AutaMedica: ${documentUrl}`)}`
                return (
                  <article key={document.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{document.kind === 'certificate' ? (isPortuguese ? 'Atestado / Certificado Médico' : 'Atestado / Certificado Médico') : document.kind === 'memed' ? 'Receita Digital Memed' : 'Receta Digital RCTA'}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-600">{document.title} · {document.provider}</p>
                        {document.verificationCode && <p className="mt-1 text-[11px] text-slate-500">{isPortuguese ? 'Código de verificação' : 'Código de verificación'}: <span className="font-mono font-semibold text-slate-800">{document.verificationCode}</span></p>}
                      </div>
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <a href={documentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-[#0EA5E9] px-3 text-xs font-semibold text-white hover:bg-[#0284C7]">{isPortuguese ? 'Abrir documento' : 'Abrir documento'}</a>
                      <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">{isPortuguese ? 'Compartilhar' : 'Compartir'}</a>
                    </div>
                  </article>
                )
              }) : <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{isPortuguese ? 'Nenhum documento foi emitido nesta consulta.' : 'No se emitieron documentos en esta consulta.'}</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session')
                window.localStorage.removeItem('autamedica:pharmacy-express:active-session')
                setRequestId(null)
                setAccessToken(null)
                setRecoveryToken(null)
                setDocuments([])
                setFormData({ careCountry: formData.careCountry, dni: '', genderCode: '', name: '', phone: '', reason: '' })
                setCountryPaymentApproved(false)
                setReasonCategory('')
                setLgpdConsent(false)
                setStep('FORM')
              }}
              className="py-2.5 px-6 rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-medium text-xs transition"
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
              onClick={() => { window.sessionStorage.removeItem('autamedica:pharmacy-express:active-session'); window.localStorage.removeItem('autamedica:pharmacy-express:active-session'); setRequestId(null); setAccessToken(null); setRecoveryToken(null); setDocuments([]); setReasonCategory(''); setStep('FORM') }}
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
