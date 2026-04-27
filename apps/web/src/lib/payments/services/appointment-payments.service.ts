import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import {
  APPOINTMENT_PAYMENT_COMMISSION_BPS,
  APPOINTMENT_PAYMENT_CURRENCY,
  APPOINTMENT_PAYMENT_PROVIDER,
  MERCADOPAGO_STATEMENT_DESCRIPTOR,
  calculateNetAmount,
  calculatePlatformFeeAmount,
} from '@/lib/payments/constants'
import { centsToMajorUnit, majorUnitToCents } from '@/lib/payments/money'

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

interface MercadoPagoPreferenceResponse {
  id: string
  init_point: string
}

interface MercadoPagoPaymentDetail {
  id: number | string
  status: string
  transaction_amount: number
  currency_id: string
  payment_method_id?: string | null
  external_reference?: string | null
  metadata?: Record<string, unknown> | null
}

interface AppointmentWithPaymentContext {
  id: string
  patient_id: string | null
  doctor_id: string | null
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
  const token = getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN') ?? import.meta.env.MERCADOPAGO_ACCESS_TOKEN
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured')
  return token
}

function getWebhookSecret(): string {
  return getRuntimeEnvValue('MERCADOPAGO_WEBHOOK_SECRET') ?? import.meta.env.MERCADOPAGO_WEBHOOK_SECRET ?? ''
}

function getAppUrl(): string {
  return getRuntimeEnvValue('PUBLIC_APP_URL') ?? import.meta.env.PUBLIC_APP_URL ?? 'https://www.autamedica.com'
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

function serializeMetadata(input: Record<string, unknown>): Json {
  return input as Json
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
    .select('id, patient_id, doctor_id, type, status, doctor:doctors!appointments_doctor_id_fkey(id, consultation_fee, payout_cbu, payout_alias)')
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

export const appointmentPaymentsService = {
  async createCheckoutPreference(
    supabase: Db,
    input: {
      appointmentId: string
      patientId: string
    },
  ): Promise<{
    appointmentPaymentId: string
    checkoutUrl: string
    preferenceId: string
    amount: number
    currency: string
  }> {
    const appointment = await findAppointmentWithDoctor(supabase, input.appointmentId)
    if (!appointment) throw new Error('appointment_not_found')
    if (appointment.patient_id !== input.patientId) throw new Error('appointment_access_denied')
    if (!appointment.doctor_id || !appointment.doctor) throw new Error('appointment_doctor_missing')

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

    if (
      (existing.data?.status === 'pending' || existing.data?.status === 'approved') &&
      existing.data.checkout_url &&
      existing.data.provider_preference_id
    ) {
      const existingPayment = existing.data as ExistingAppointmentPayment
      return {
        appointmentPaymentId: existingPayment.id,
        checkoutUrl: existingPayment.checkout_url,
        preferenceId: existingPayment.provider_preference_id,
        amount: existingPayment.gross_amount,
        currency: existingPayment.currency,
      }
    }

    const appUrl = getAppUrl()
    const amount = centsToMajorUnit(amountCents)
    const mpResponse = await mpFetch<MercadoPagoPreferenceResponse>('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          title: 'AutaMedica - Consulta medica',
          description: `Consulta ${appointment.type ?? 'consultation'}`,
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
  ): Promise<void> {
    if (type !== 'payment') {
      logger.info('[appointment-payments] Unhandled MercadoPago webhook type', { type, dataId })
      return
    }

    const payment = await mpFetch<MercadoPagoPaymentDetail>(`/v1/payments/${dataId}`)
    const appointmentId =
      typeof payment.metadata?.appointment_id === 'string'
        ? payment.metadata.appointment_id
        : payment.external_reference ?? null

    if (!appointmentId) {
      logger.warn('[appointment-payments] Payment without appointment reference', {
        paymentId: payment.id,
      })
      return
    }

    const appointment = await findAppointmentWithDoctor(supabase, appointmentId)
    if (!appointment?.patient_id || !appointment.doctor_id) {
      logger.warn('[appointment-payments] Appointment missing patient or doctor while processing webhook', {
        appointmentId,
        paymentId: payment.id,
      })
      return
    }

    const status = mapMercadoPagoStatus(payment.status)
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
        paid_at: status === 'approved' ? new Date().toISOString() : null,
        metadata: serializeMetadata({
          ...(payment.metadata ?? {}),
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
    }
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
