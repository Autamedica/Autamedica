import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, forbidden, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { getOperationalPaymentSwitches } from '@/lib/payments/operational-switches'

const MERCADOPAGO_API = 'https://api.mercadopago.com'

interface PixPaymentRequest {
  type: 'appointment' | 'subscription' | 'wallet_topup'
  appointmentId?: string
  patientCpf?: string
  amountCents?: number
  idempotencyKey?: string
}

interface MpPixResponse {
  id: number
  status: string
  status_detail: string
  date_of_expiration: string
  transaction_amount: number
  point_of_interaction?: {
    transaction_data?: {
      qr_code: string
      qr_code_base64: string
      ticket_url: string
    }
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const patientContext = await resolvePatientContext(request, locals)
  if (!patientContext) return unauthorized('patient_unauthorized')

  try {
    const body = (await request.json()) as PixPaymentRequest
    const { type = 'subscription', appointmentId, patientCpf } = body

    const mpToken =
      (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined) ??
      getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN') ??
      import.meta.env?.MERCADOPAGO_ACCESS_TOKEN
    const appUrl = (
      (locals.runtime?.env?.PUBLIC_APP_URL as string | undefined) ??
      getRuntimeEnvValue('PUBLIC_APP_URL') ??
      import.meta.env?.PUBLIC_APP_URL ??
      'https://www.autamedica.com'
    ).replace(/\/+$/, '')

    if (!mpToken) {
      logger.error('[pix/create] MERCADOPAGO_ACCESS_TOKEN is missing in runtime')
      return internalError('payment_access_token_missing')
    }

    const admin = createAstroAdminClient(locals.runtime?.env)
    const switches = await getOperationalPaymentSwitches(admin).catch(() => null)
    if (!switches?.global_pix_mp_payments_enabled) {
      return new Response(JSON.stringify({ success: false, error: { message: 'global_pix_mp_payments_disabled' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })
    }

    // Obtener datos del perfil del paciente para el payer (user_id en tabla profiles)
    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('user_id', patientContext.userId)
      .maybeSingle()

    const payerEmail = (profile as { email?: string } | null)?.email ?? locals?.session?.user?.email ?? 'paciente@autamedica.com'
    const firstName = (profile as { first_name?: string } | null)?.first_name || 'Paciente'
    const lastName = (profile as { last_name?: string } | null)?.last_name || 'AutaMedica'

    let amountBrl = 49.9
    let description = 'AutaMedica Brasil - Plano Cuidado Mensal'
    let externalReference = `sub:${patientContext.patientId}`
    let expirationMinutes = 60 // 1 hora (60 minutos)
    let doctorId: string | null = null

    if (type === 'appointment') {
      if (appointmentId) {
        const { data: apt, error: aptError } = await admin
          .from('appointments')
          .select('id, patient_id, doctor_id, doctor:doctors!appointments_doctor_id_fkey(consultation_fee)')
          .eq('id', appointmentId)
          .maybeSingle()

        if (!apt) {
          logger.error('[pix/create] appointment lookup failed', { appointmentId, aptError })
          return badRequest('appointment_not_found')
        }

        const aptData = apt as {
          id: string
          patient_id?: string | null
          doctor_id: string
          doctor?: { consultation_fee?: number | null } | null
        }

        if (aptData.patient_id && aptData.patient_id !== patientContext.patientId) {
          return forbidden('appointment_belongs_to_another_patient')
        }

        doctorId = aptData.doctor_id
        const doctorFee = aptData.doctor?.consultation_fee ?? 15000
        amountBrl = doctorFee / 100
        description = 'AutaMedica Brasil - Teleconsulta Médica'
        externalReference = `apt:${appointmentId}`
      } else if (body.amountCents) {
        amountBrl = Math.max(10, body.amountCents / 100)
        description = 'AutaMedica Brasil - Teleconsulta Médica Particular'
        externalReference = `particular:${patientContext.patientId}`
      } else {
        return badRequest('appointment_id_required')
      }
      expirationMinutes = 60 // 1 hora (60 minutos)
    } else if (type === 'wallet_topup') {
      const topupCents = body.amountCents ?? 5000
      amountBrl = topupCents / 100
      description = 'AutaMedica - Carga de Saldo Billetera'
      externalReference = `topup:${patientContext.patientId}`
      expirationMinutes = 60 // 1 hora (60 minutos)
    }

    const expirationDate = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString()
    const cleanCpf = patientCpf?.replace(/\D/g, '')

    // Llamada directa a MercadoPago /v1/payments con método Pix
    const mpRes = await fetch(`${MERCADOPAGO_API}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpToken}`,
        'X-Idempotency-Key': body.idempotencyKey
          ? `pix_${body.idempotencyKey}`
          : type === 'subscription'
            ? `pix_sub_${patientContext.patientId}_${new Date().toISOString().slice(0, 10)}`
            : `pix_${type}_${externalReference}`,
      },
      body: JSON.stringify({
        transaction_amount: amountBrl,
        description,
        payment_method_id: 'pix',
        date_of_expiration: expirationDate,
        notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
        external_reference: externalReference,
        payer: {
          email: payerEmail,
          first_name: firstName,
          last_name: lastName,
          identification: cleanCpf ? { type: 'CPF', number: cleanCpf } : undefined,
        },
        metadata: {
          payment_type: type,
          type,
          patient_id: patientContext.patientId,
          appointment_id: appointmentId ?? null,
        },
      }),
    })

    if (!mpRes.ok) {
      const errText = await mpRes.text()
      logger.error('[pix/create] MercadoPago Pix generation failed', {
        status: mpRes.status,
        body: errText,
        amountBrl,
        type,
      })
      return internalError('mercadopago_pix_generation_failed')
    }

    const mpData = (await mpRes.json()) as MpPixResponse
    const txData = mpData.point_of_interaction?.transaction_data

    if (!txData?.qr_code) {
      logger.error('[pix/create] Pix QR code missing in MercadoPago response', mpData)
      return internalError('pix_qr_code_missing')
    }

    // Persistir estado pendiente en base de datos
    if (type === 'appointment' && appointmentId) {
      await admin.from('appointment_payments').upsert(
        {
          appointment_id: appointmentId,
          patient_id: patientContext.patientId,
          doctor_id: doctorId,
          gross_amount: Math.round(amountBrl * 100),
          currency: 'BRL',
          status: 'pending',
          provider: 'mercadopago',
          provider_payment_id: String(mpData.id),
          metadata: {
            payment_method: 'pix',
            qr_code: txData.qr_code,
            expires_at: mpData.date_of_expiration,
            ticket_url: txData.ticket_url,
          },
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'appointment_id' },
      )
    } else if (type === 'subscription') {
      await admin.from('patient_subscriptions' as never).upsert(
        {
          patient_id: patientContext.patientId,
          tier: 'cuidado',
          status: 'trialing',
          price_cents: 4990,
          currency: 'BRL',
          payment_provider: 'mercadopago_pix',
          provider_subscription_id: String(mpData.id),
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'patient_id' },
      )
    }

    logger.info('[pix/create] Pix payment created successfully', {
      paymentId: mpData.id,
      type,
      amountBrl,
      patientId: patientContext.patientId,
    })

    return jsonOk(
      {
        paymentId: mpData.id,
        status: mpData.status,
        qrCode: txData.qr_code,
        qrCodeBase64: txData.qr_code_base64,
        ticketUrl: txData.ticket_url,
        expiresAt: mpData.date_of_expiration,
        amountCents: Math.round(amountBrl * 100),
        currency: 'BRL',
      },
      201,
    )
  } catch (error) {
    logger.error('[pix/create] Unhandled error', error)
    return internalError('pix_checkout_failed')
  }
}
