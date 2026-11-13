import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { reconcilePharmacyProviderPayment } from '@/lib/pharmacy/payments/referral-finance'
import {
  APPOINTMENT_PAYMENT_COMMISSION_BPS,
  APPOINTMENT_PAYMENT_CURRENCY,
  APPOINTMENT_PAYMENT_PROVIDER,
  MERCADOPAGO_STATEMENT_DESCRIPTOR,
  calculateNetAmount,
  calculatePlatformFeeAmount,
} from '@/lib/payments/constants'
import { centsToMajorUnit, majorUnitToCents } from '@/lib/payments/money'
import { careEpisodesService } from '@/lib/clinical-safety/services/care-episodes.service'
import { getOperationalPaymentSwitches } from '@/lib/payments/operational-switches'

type Db = SupabaseClient<Database>

type AppointmentPaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded'

type ExistingAppointmentPayment = {
  id: string
  status: AppointmentPaymentStatus
  checkout_url: string | null
  provider_preference_id: string | null
  gross_amount: number
  currency: string
  patient_id: string
  doctor_id: string
}

type PatientWalletBalance = {
  available_credit_cents: number | null
}

type PatientWalletPaymentResult = {
  success: boolean
  message: string
  appointment_payment_id: string | null
  ledger_id: string | null
  amount_cents: number
  new_available_credit_cents: number | null
}

interface MercadoPagoPreferenceResponse {
  id: string
  init_point: string
}

interface MercadoPagoPaymentDetail {
  id: number | string
  status: string
  status_detail?: string | null
  transaction_amount: number
  currency_id: string
  payment_method_id?: string | null
  external_reference?: string | null
  date_approved?: string | null
  date_last_updated?: string | null
  transaction_details?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

interface AppointmentWithPaymentContext {
  id: string
  patient_id: string | null
  doctor_id: string | null
  start_time: string | null
  type: string | null
  status: string | null
  doctor: {
    id: string
    consultation_fee: number | null
    payout_cbu: string | null
    payout_alias: string | null
  } | null
}

const MERCADOPAGO_API = 'https://api.mercadopago.com'

function getMercadoPagoToken(): string {
  const token = getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN') ?? import.meta.env?.MERCADOPAGO_ACCESS_TOKEN
  if (!token) throw new Error('payment_access_token_missing')
  return token
}

function getWebhookSecret(): string {
  return getRuntimeEnvValue('MERCADOPAGO_WEBHOOK_SECRET') ?? import.meta.env?.MERCADOPAGO_WEBHOOK_SECRET ?? ''
}

function getAppUrl(): string {
  const appUrl = getRuntimeEnvValue('PUBLIC_APP_URL') ?? import.meta.env?.PUBLIC_APP_URL
  if (!appUrl) throw new Error('payment_app_url_missing')
  return appUrl.replace(/\/+$/, '')
}

function assertWebhookRuntimeConfigured(): void {
  if (!getWebhookSecret()) {
    throw new Error('payment_webhook_secret_missing')
  }

  getAppUrl()
}

async function mpFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getMercadoPagoToken()
  const res = await fetch(`${MERCADOPAGO_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    logger.error('[appointment-payments] MercadoPago API error', {
      status: res.status,
      body,
      path,
    })
    throw new Error(`MercadoPago API ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

function mapMercadoPagoStatus(status: string): AppointmentPaymentStatus {
  const mapping: Record<string, AppointmentPaymentStatus> = {
    approved: 'approved',
    rejected: 'rejected',
    refunded: 'refunded',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    pending: 'pending',
    in_process: 'pending',
  }

  return mapping[status] ?? 'pending'
}

function resolveAppointmentPaymentStatus(payment: MercadoPagoPaymentDetail): AppointmentPaymentStatus {
  const mapped = mapMercadoPagoStatus(payment.status)

  if (mapped === 'pending' && payment.date_approved) {
    return 'approved'
  }

  return mapped
}

function serializeMetadata(input: Record<string, unknown>): Json {
  return input as Json
}

function normalizeWhatsappPhone(value?: string | null): string | null {
  const phone = value?.replace(/[^0-9]/g, '') ?? ''
  return phone.length >= 8 ? phone : null
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false

  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return result === 0
}

function parseMercadoPagoSignature(signature: string): { ts: string | null; v1: string | null } {
  return signature.split(',').reduce<{ ts: string | null; v1: string | null }>(
    (acc, part) => {
      const [rawKey, ...rawValue] = part.split('=')
      const key = rawKey?.trim()
      const value = rawValue.join('=').trim()
      if (key === 'ts') acc.ts = value
      if (key === 'v1') acc.v1 = value
      return acc
    },
    { ts: null, v1: null },
  )
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function findAppointmentWithDoctor(
  supabase: Db,
  appointmentId: string,
): Promise<AppointmentWithPaymentContext | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, patient_id, doctor_id, start_time, type, status, doctor:doctors!appointments_doctor_id_fkey(id, consultation_fee, payout_cbu, payout_alias)')
    .eq('id', appointmentId)
    .maybeSingle()

  if (error) {
    logger.error('[appointment-payments] findAppointmentWithDoctor failed', { appointmentId, error })
    throw error
  }

  return data as unknown as AppointmentWithPaymentContext | null
}

async function updateAppointmentStatus(
  supabase: Db,
  appointmentId: string,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({
      status,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', appointmentId)

  if (error) {
    logger.error('[appointment-payments] updateAppointmentStatus failed', {
      appointmentId,
      status,
      error,
    })
    throw error
  }
}

async function ensureDoctorWhatsAppJobForConfirmedAppointment(
  supabase: Db,
  appointment: AppointmentWithPaymentContext,
): Promise<void> {
  if (!appointment.doctor_id || !appointment.patient_id || !appointment.start_time) return

  const { data: doctor, error: doctorError } = await supabase
    .from('doctors')
    .select('user_id')
    .eq('id', appointment.doctor_id)
    .maybeSingle()

  if (doctorError || !doctor?.user_id) {
    logger.error('[appointment-payments] doctor profile owner lookup failed', {
      appointmentId: appointment.id,
      doctorId: appointment.doctor_id,
      error: doctorError,
    })
    return
  }

  const { data: doctorProfile, error: doctorProfileError } = await supabase
    .from('profiles')
    .select('first_name, phone')
    .eq('user_id', doctor.user_id)
    .maybeSingle()

  if (doctorProfileError) {
    logger.error('[appointment-payments] doctor profile lookup failed', {
      appointmentId: appointment.id,
      doctorId: appointment.doctor_id,
      error: doctorProfileError,
    })
    return
  }

  const doctorPhone = normalizeWhatsappPhone(doctorProfile?.phone)
  if (!doctorPhone) {
    logger.warn('[appointment-payments] doctor WhatsApp phone missing', {
      appointmentId: appointment.id,
      doctorId: appointment.doctor_id,
    })
    return
  }

  const { data: patient } = await supabase
    .from('patients')
    .select('user_id')
    .eq('id', appointment.patient_id)
    .maybeSingle()

  const { data: patientProfile } = patient?.user_id
    ? await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', patient.user_id)
      .maybeSingle()
    : { data: null }

  const patientName = [patientProfile?.first_name, patientProfile?.last_name].filter(Boolean).join(' ').trim() || 'Un paciente'
  const start = new Date(appointment.start_time).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const message = [
    'AutaMedica - nueva consulta confirmada',
    `Paciente: ${patientName}`,
    `Fecha y hora: ${start}`,
    `Tipo de atención: ${appointment.type || 'Consulta médica'}`,
    'Revisá la agenda y el contexto clínico antes del turno.',
    'Agenda médica: https://doctor.autamedica.com/doctors/appointments',
  ].join('\n')

  const { error } = await supabase
    .schema('growth_os')
    .from('doctor_whatsapp_jobs')
    .insert({
      appointment_id: appointment.id,
      doctor_id: appointment.doctor_id,
      user_id: doctor.user_id,
      recipient_phone: doctorPhone,
      message,
      dedupe_key: `doctor_whatsapp:appointment_confirmed:${appointment.id}`,
    } as never)

  if (error && error.code !== '23505') {
    logger.error('[appointment-payments] doctor WhatsApp job fallback failed', {
      appointmentId: appointment.id,
      doctorId: appointment.doctor_id,
      error,
    })
  }
}

export const appointmentPaymentsService = {
  async createCheckoutPreference(
    supabase: Db,
    input: {
      appointmentId: string
      patientId: string
    },
  ): Promise<{
    appointmentPaymentId: string
    checkoutUrl: string | null
    preferenceId: string | null
    amount: number
    currency: string
    paymentSource: 'mercadopago' | 'patient_wallet'
    status: 'checkout_required' | 'covered_by_credit'
    walletLedgerId?: string | null
    remainingCreditCents?: number | null
  }> {
    const appointment = await findAppointmentWithDoctor(supabase, input.appointmentId)
    if (!appointment) throw new Error('appointment_not_found')
    if (appointment.patient_id !== input.patientId) throw new Error('appointment_access_denied')
    if (!appointment.doctor_id || !appointment.doctor) throw new Error('appointment_doctor_missing')
    const switches = await getOperationalPaymentSwitches(supabase).catch(() => null)
    if (!switches?.global_pix_mp_payments_enabled) throw new Error('global_pix_mp_payments_disabled')

    const amountCents = appointment.doctor.consultation_fee
    if (!amountCents || amountCents <= 0) throw new Error('doctor_consultation_fee_missing')

    const existing = await supabase
      .from('appointment_payments')
      .select('id, status, checkout_url, provider_preference_id, gross_amount, currency, patient_id, doctor_id')
      .eq('appointment_id', appointment.id)
      .maybeSingle()

    if (existing.error) {
      logger.error('[appointment-payments] existing payment lookup failed', {
        appointmentId: appointment.id,
        error: existing.error,
      })
      throw existing.error
    }

    if (existing.data?.status === 'approved') {
      const existingPayment = existing.data as ExistingAppointmentPayment
      const isWalletPayment = existingPayment.provider_preference_id === null
        && existingPayment.checkout_url === null
      return {
        appointmentPaymentId: existingPayment.id,
        checkoutUrl: existingPayment.checkout_url ?? null,
        preferenceId: existingPayment.provider_preference_id ?? null,
        amount: existingPayment.gross_amount,
        currency: existingPayment.currency,
        paymentSource: isWalletPayment ? 'patient_wallet' : 'mercadopago',
        status: isWalletPayment ? 'covered_by_credit' : 'checkout_required',
      }
    }

    if (existing.data?.status === 'pending' && existing.data.checkout_url && existing.data.provider_preference_id) {
      const existingPayment = existing.data as ExistingAppointmentPayment
      return {
        appointmentPaymentId: existingPayment.id,
        checkoutUrl: existingPayment.checkout_url,
        preferenceId: existingPayment.provider_preference_id,
        amount: existingPayment.gross_amount,
        currency: existingPayment.currency,
        paymentSource: 'mercadopago',
        status: 'checkout_required',
      }
    }

    const { data: walletRows, error: walletError } = await (supabase as unknown as SupabaseClient)
      .rpc('patient_wallet_get_balance', { p_patient_id: input.patientId })

    if (walletError) {
      logger.error('[appointment-payments] patient wallet balance lookup failed', {
        appointmentId: appointment.id,
        patientId: input.patientId,
        error: walletError,
      })
      throw walletError
    }

    const walletBalance = Array.isArray(walletRows)
      ? walletRows[0] as PatientWalletBalance | undefined
      : null
    const availableCreditCents = Number(walletBalance?.available_credit_cents ?? 0)

    if (availableCreditCents >= amountCents) {
      const { data: walletPaymentRows, error: walletPaymentError } = await (supabase as unknown as SupabaseClient)
        .rpc('pay_appointment_with_patient_wallet', {
          p_appointment_id: appointment.id,
          p_patient_id: input.patientId,
          p_idempotency_key: `patient_wallet_payment:${appointment.id}`,
        })

      if (walletPaymentError) {
        logger.error('[appointment-payments] patient wallet payment failed', {
          appointmentId: appointment.id,
          patientId: input.patientId,
          error: walletPaymentError,
        })
        throw walletPaymentError
      }

      const walletPayment = Array.isArray(walletPaymentRows)
        ? walletPaymentRows[0] as PatientWalletPaymentResult | undefined
        : null

      if (!walletPayment?.success || !walletPayment.appointment_payment_id) {
        throw new Error(walletPayment?.message || 'patient_wallet_payment_failed')
      }

      await ensureDoctorWhatsAppJobForConfirmedAppointment(supabase, appointment)
      try {
        await careEpisodesService.upsertForPaidAppointment(supabase, appointment.id)
      } catch (episodeError) {
        logger.error('[appointment-payments] episode creation failed after wallet confirmation', {
          appointmentId: appointment.id,
          error: episodeError instanceof Error ? episodeError.message : String(episodeError),
        })
      }

      return {
        appointmentPaymentId: walletPayment.appointment_payment_id,
        checkoutUrl: null,
        preferenceId: null,
        amount: walletPayment.amount_cents,
        currency: APPOINTMENT_PAYMENT_CURRENCY,
        paymentSource: 'patient_wallet',
        status: 'covered_by_credit',
        walletLedgerId: walletPayment.ledger_id,
        remainingCreditCents: walletPayment.new_available_credit_cents,
      }
    }

    assertWebhookRuntimeConfigured()

    const appUrl = getAppUrl()
    const amount = centsToMajorUnit(amountCents)
    const mpResponse = await mpFetch<MercadoPagoPreferenceResponse>('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          title: 'AutaMedica - Consulta medica',
          description: `Consulta ${appointment.type ?? 'consultation'} con revision de cierre incluida si el caso lo requiere`,
          quantity: 1,
          unit_price: amount,
          currency_id: APPOINTMENT_PAYMENT_CURRENCY,
        }],
        back_urls: {
          success: `${appUrl}/patients/appointments?payment=success&appointmentId=${appointment.id}`,
          failure: `${appUrl}/patients/appointments?payment=failure&appointmentId=${appointment.id}`,
          pending: `${appUrl}/patients/appointments?payment=pending&appointmentId=${appointment.id}`,
        },
        auto_return: 'approved',
        statement_descriptor: MERCADOPAGO_STATEMENT_DESCRIPTOR,
        external_reference: appointment.id,
        notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
        metadata: {
          appointment_id: appointment.id,
          patient_id: appointment.patient_id,
          doctor_id: appointment.doctor_id,
          care_model: 'episode_safe_closure',
          ceeds_closure_included: true,
        },
      }),
    })

    const { data, error } = await supabase
      .from('appointment_payments')
      .upsert({
        appointment_id: appointment.id,
        patient_id: input.patientId,
        doctor_id: appointment.doctor_id,
        gross_amount: amountCents,
        currency: APPOINTMENT_PAYMENT_CURRENCY,
        status: 'pending',
        provider: APPOINTMENT_PAYMENT_PROVIDER,
        provider_preference_id: mpResponse.id,
        checkout_url: mpResponse.init_point,
        metadata: serializeMetadata({
          appointment_id: appointment.id,
          doctor_id: appointment.doctor_id,
          patient_id: appointment.patient_id,
          commission_bps: APPOINTMENT_PAYMENT_COMMISSION_BPS,
          care_model: 'episode_safe_closure',
          ceeds_closure_included: true,
          patient_billable_ceeds_review: false,
        }),
        updated_at: new Date().toISOString(),
      } as never, {
        onConflict: 'appointment_id',
      })
      .select('id')
      .single()

    if (error) {
      logger.error('[appointment-payments] upsert appointment payment failed', {
        appointmentId: appointment.id,
        error,
      })
      throw error
    }

    if (appointment.status !== 'payment_pending') {
      await updateAppointmentStatus(supabase, appointment.id, 'payment_pending')
    }

    return {
      appointmentPaymentId: data.id,
      checkoutUrl: mpResponse.init_point,
      preferenceId: mpResponse.id,
      amount: amountCents,
      currency: APPOINTMENT_PAYMENT_CURRENCY,
      paymentSource: 'mercadopago',
      status: 'checkout_required',
    }
  },

  async hasApprovedPayment(supabase: Db, appointmentId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('appointment_payments')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('status', 'approved')
      .maybeSingle()

    if (error) {
      logger.error('[appointment-payments] hasApprovedPayment failed', { appointmentId, error })
      throw error
    }

    return Boolean(data)
  },

  async handleWebhookNotification(
    supabase: Db,
    type: string,
    dataId: string,
  ): Promise<{ handled: boolean; ignored?: boolean; reason?: string }> {
    if (type !== 'payment') {
      logger.info('[appointment-payments] Unhandled MercadoPago webhook type', { type, dataId })
      return { handled: false, ignored: true, reason: `unhandled_type:${type}` }
    }

    // Si es un ID de prueba simulado por Mercado Pago Developers (ej: 123456 o test_payment_id)
    if (dataId === '123456' || dataId === 'test_payment_id') {
      logger.info('[appointment-payments] Simulated MercadoPago test payment received', { dataId })
      return { handled: false, ignored: true, reason: 'payment_not_found_or_simulated' }
    }

    let payment: MercadoPagoPaymentDetail
    try {
      payment = await mpFetch<MercadoPagoPaymentDetail>(`/v1/payments/${dataId}`)
    } catch (fetchError) {
      const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError)
      // Si Mercado Pago devuelve 404 (pago de prueba o inexistente), registrar warning y retornar 200
      if (errMsg.includes('404') || errMsg.includes('not_found')) {
        logger.warn('[appointment-payments] Webhook payment ID not found in MercadoPago (simulated or expired)', {
          dataId,
          error: errMsg,
        })
        return { handled: false, ignored: true, reason: 'payment_not_found_or_simulated' }
      }
      throw fetchError
    }

    // Pharmacy QR consultations are paid against an explicitly authorized
    // dispatch, not an appointment guessed from DNI/CPF/name/phone.
    if (payment.metadata?.payment_type === 'pharmacy_consultation' ||
        payment.external_reference?.startsWith('pharm:')) {
      const reconciliation = await reconcilePharmacyProviderPayment(
        supabase as unknown as SupabaseClient, payment,
      )
      return {
        handled: reconciliation.handled,
        ignored: !reconciliation.handled,
        reason: reconciliation.reason,
      }
    }

    const isWalletTopup = payment.metadata?.type === 'wallet_topup'
    if (isWalletTopup) {
      const patientId = payment.metadata?.patient_id
      const amountCents = majorUnitToCents(payment.transaction_amount)
      const status = resolveAppointmentPaymentStatus(payment)

      if (status === 'approved' && patientId && amountCents > 0) {
        const reason = `Carga de Saldo vía Mercado Pago (Pago ID: ${payment.id})`
        const idempotencyKey = `wallet_topup:${payment.id}`

        const { error } = await supabase.rpc('grant_patient_wallet_credit' as never, {
          p_patient_id: patientId,
          p_amount_cents: amountCents,
          p_reason: reason,
          p_idempotency_key: idempotencyKey,
        } as never)

        if (error) {
          logger.error('[appointment-payments] Webhook wallet topup failed to grant credit', {
            paymentId: payment.id,
            patientId,
            amountCents,
            error,
          })
          throw error
        }

        logger.info('[appointment-payments] Webhook wallet topup credited successfully', {
          paymentId: payment.id,
          patientId,
          amountCents,
        })
      }
      return { handled: true }
    }

    const isSubscription =
      payment.metadata?.type === 'subscription' ||
      payment.metadata?.payment_type === 'subscription' ||
      (typeof payment.external_reference === 'string' && payment.external_reference.startsWith('sub:'))

    if (isSubscription) {
      const patientId =
        (payment.metadata?.patient_id as string | undefined) ??
        (typeof payment.external_reference === 'string' && payment.external_reference.startsWith('sub:')
          ? payment.external_reference.slice(4)
          : null)

      const status = resolveAppointmentPaymentStatus(payment)

      if (patientId) {
        if (status === 'approved') {
          const { error: subError } = await supabase.from('patient_subscriptions' as never).upsert(
            {
              patient_id: patientId,
              tier: 'cuidado',
              status: 'active',
              price_cents: majorUnitToCents(payment.transaction_amount) || 4990,
              currency: payment.currency_id || 'BRL',
              payment_provider: 'mercadopago_pix',
              provider_subscription_id: String(payment.id),
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: 'patient_id' },
          )

          if (subError) {
            logger.error('[appointment-payments] Webhook subscription activation failed', {
              paymentId: payment.id,
              patientId,
              error: subError,
            })
            throw subError
          }

          // Ensure Health Reserve in DB
          const { error: reserveError } = await supabase.rpc('ensure_patient_health_reserve' as never, {
            p_patient_id: patientId,
          } as never)

          if (reserveError) {
            logger.error('[appointment-payments] Webhook ensure_patient_health_reserve failed', {
              patientId,
              error: reserveError,
            })
          }

          logger.info('[appointment-payments] Webhook Plano Cuidado subscription activated successfully', {
            paymentId: payment.id,
            patientId,
          })
        }
      }
      return { handled: true }
    }

    const appointmentId =
      typeof payment.metadata?.appointment_id === 'string'
        ? payment.metadata.appointment_id
        : payment.external_reference?.startsWith('apt:')
          ? payment.external_reference.slice(4)
          : payment.external_reference ?? null

    if (!appointmentId) {
      logger.warn('[appointment-payments] Payment without appointment reference', {
        paymentId: payment.id,
      })
      return { handled: false, ignored: true, reason: 'missing_appointment_reference' }
    }

    const appointment = await findAppointmentWithDoctor(supabase, appointmentId)
    if (!appointment?.patient_id || !appointment.doctor_id) {
      logger.warn('[appointment-payments] Appointment missing patient or doctor while processing webhook', {
        appointmentId,
        paymentId: payment.id,
      })
      return { handled: false, ignored: true, reason: 'appointment_missing_patient_or_doctor' }
    }

    const status = resolveAppointmentPaymentStatus(payment)
    const amountCents = majorUnitToCents(payment.transaction_amount)
    const currency = payment.currency_id || APPOINTMENT_PAYMENT_CURRENCY

    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from('appointment_payments')
      .select('id, gross_amount, currency, patient_id, doctor_id')
      .eq('appointment_id', appointment.id)
      .maybeSingle()

    if (existingPaymentError) {
      logger.error('[appointment-payments] existing payment lookup from webhook failed', {
        appointmentId,
        paymentId: payment.id,
        error: existingPaymentError,
      })
      throw existingPaymentError
    }

    const expectedAmountCents = existingPayment?.gross_amount ?? appointment.doctor?.consultation_fee ?? null
    const expectedCurrency = existingPayment?.currency ?? APPOINTMENT_PAYMENT_CURRENCY

    if (currency !== expectedCurrency) {
      throw new Error(`payment_currency_mismatch:${currency}:${expectedCurrency}`)
    }

    if (status === 'approved' && expectedAmountCents !== null && amountCents !== expectedAmountCents) {
      throw new Error(`payment_amount_mismatch:${amountCents}:${expectedAmountCents}`)
    }

    if (
      existingPayment &&
      (existingPayment.patient_id !== appointment.patient_id || existingPayment.doctor_id !== appointment.doctor_id)
    ) {
      throw new Error('payment_appointment_party_mismatch')
    }

    const { error } = await supabase
      .from('appointment_payments')
      .upsert({
        appointment_id: appointment.id,
        patient_id: appointment.patient_id,
        doctor_id: appointment.doctor_id,
        gross_amount: amountCents,
        currency,
        status,
        provider: APPOINTMENT_PAYMENT_PROVIDER,
        provider_payment_id: String(payment.id),
        paid_at: status === 'approved' ? payment.date_approved ?? new Date().toISOString() : null,
        metadata: serializeMetadata({
          ...(payment.metadata ?? {}),
          mp_status: payment.status,
          mp_status_detail: payment.status_detail ?? null,
          mp_date_approved: payment.date_approved ?? null,
          mp_date_last_updated: payment.date_last_updated ?? null,
          mp_transaction_details: payment.transaction_details ?? null,
          payment_method_id: payment.payment_method_id ?? null,
        }),
        updated_at: new Date().toISOString(),
      } as never, {
        onConflict: 'appointment_id',
      })

    if (error) {
      logger.error('[appointment-payments] upsert from webhook failed', {
        appointmentId,
        paymentId: payment.id,
        error,
      })
      throw error
    }

    if (status === 'approved') {
      await updateAppointmentStatus(supabase, appointment.id, 'confirmed')
      await ensureDoctorWhatsAppJobForConfirmedAppointment(supabase, appointment)
      try {
        await careEpisodesService.upsertForPaidAppointment(supabase, appointment.id)
      } catch (episodeError) {
        logger.error('[appointment-payments] episode creation failed after confirmation', {
          appointmentId: appointment.id,
          error: episodeError instanceof Error ? episodeError.message : String(episodeError),
        })
      }
    }

    return { handled: true }
  },

  async createDoctorEarningForAppointment(
    supabase: Db,
    appointmentId: string,
  ): Promise<void> {
    const { data: payment, error: paymentError } = await supabase
      .from('appointment_payments')
      .select('id, doctor_id, gross_amount, currency, status, metadata, doctor:doctors!appointment_payments_doctor_id_fkey(payout_cbu, payout_alias)')
      .eq('appointment_id', appointmentId)
      .eq('status', 'approved')
      .maybeSingle()

    if (paymentError) {
      logger.error('[appointment-payments] createDoctorEarning payment lookup failed', {
        appointmentId,
        error: paymentError,
      })
      throw paymentError
    }

    if (!payment) {
      return
    }

    await careEpisodesService.upsertForPaidAppointment(supabase, appointmentId)

    const platformFeeAmount = calculatePlatformFeeAmount(payment.gross_amount)
    const processorFeeAmount = 0
    const netAmount = calculateNetAmount(payment.gross_amount, processorFeeAmount)

    const { error } = await supabase
      .from('doctor_earnings')
      .upsert({
        doctor_id: payment.doctor_id,
        appointment_id: appointmentId,
        appointment_payment_id: payment.id,
        gross_amount: payment.gross_amount,
        platform_fee_amount: platformFeeAmount,
        processor_fee_amount: processorFeeAmount,
        net_amount: netAmount,
        currency: payment.currency,
        status: 'pending',
        payout_cbu_snapshot: payment.doctor?.payout_cbu ?? null,
        payout_alias_snapshot: payment.doctor?.payout_alias ?? null,
        metadata: serializeMetadata({
          ...(typeof payment.metadata === 'object' && payment.metadata ? payment.metadata as Record<string, unknown> : {}),
          commission_bps: APPOINTMENT_PAYMENT_COMMISSION_BPS,
        }),
        updated_at: new Date().toISOString(),
      } as never, {
        onConflict: 'appointment_id',
      })

    if (error) {
      logger.error('[appointment-payments] createDoctorEarning upsert failed', {
        appointmentId,
        error,
      })
      throw error
    }
  },

  async createWalletTopupPreference(
    _supabase: Db,
    patientId: string,
    amountCents: number,
    patientEmail: string,
  ): Promise<{
    preferenceId: string
    checkoutUrl: string
  }> {
    assertWebhookRuntimeConfigured()

    const appUrl = getAppUrl()
    const amount = centsToMajorUnit(amountCents)
    const mpResponse = await mpFetch<MercadoPagoPreferenceResponse>('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          title: 'AutaMedica - Carga de Saldo',
          description: `Carga de credito virtual en billetera para consultas medicas en AutaMedica`,
          quantity: 1,
          unit_price: amount,
          currency_id: APPOINTMENT_PAYMENT_CURRENCY,
        }],
        payer: {
          email: patientEmail,
        },
        back_urls: {
          success: `${appUrl}/patients/appointments?payment=success&type=wallet_topup`,
          failure: `${appUrl}/patients/appointments?payment=failure&type=wallet_topup`,
          pending: `${appUrl}/patients/appointments?payment=pending&type=wallet_topup`,
        },
        auto_return: 'approved',
        statement_descriptor: MERCADOPAGO_STATEMENT_DESCRIPTOR,
        notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
        metadata: {
          type: 'wallet_topup',
          patient_id: patientId,
          amount_cents: amountCents,
        },
      }),
    })

    return {
      preferenceId: mpResponse.id,
      checkoutUrl: mpResponse.init_point,
    }
  },

  async validateWebhookSignature(input: {
    signature: string | null
    requestId: string | null
    dataId: string | null
  }): Promise<boolean> {
    const secret = getWebhookSecret()
    if (!secret || !input.signature || !input.requestId || !input.dataId) return false

    const { ts, v1 } = parseMercadoPagoSignature(input.signature)
    if (!ts || !v1) return false

    const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${ts};`
    const expected = await hmacSha256Hex(secret, manifest)

    return constantTimeEqual(expected, v1)
  },
}
