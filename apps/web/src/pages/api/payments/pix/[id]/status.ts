import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import {
  isMatchingApprovedPixAppointment,
  isMatchingApprovedPixSubscription,
  type LocalAppointmentPaymentEvidence,
  type PixProviderEvidence,
} from '@/lib/payments/pix-evidence'

const MERCADOPAGO_API = 'https://api.mercadopago.com'

/**
 * Read status for the authenticated patient's OWN payment.
 * Only a matching provider-confirmed PIX may update payment state.
 * No arbitrary "apt:" reference may authorize another patient's appointment.
 */
export const GET: APIRoute = async ({ params, request, locals }) => {
  const patientContext = await resolvePatientContext(request, locals)
  if (!patientContext) return unauthorized('patient_unauthorized')

  const paymentId = params.id ?? ''
  if (!/^\d{1,20}$/.test(paymentId)) return badRequest('invalid_mercadopago_payment_id')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)

    const [{ data: appointmentPayment, error: appointmentErr }, { data: rawSubscription, error: subscriptionErr }] = await Promise.all([
      admin.from('appointment_payments')
        .select('id, appointment_id, patient_id, provider, provider_payment_id, gross_amount, currency, status')
        .eq('patient_id', patientContext.patientId)
        .eq('provider_payment_id', paymentId)
        .maybeSingle(),
      admin.from('patient_subscriptions' as never)
        .select('patient_id, provider_subscription_id, currency, price_cents, status, tier, current_period_end')
        .eq('patient_id', patientContext.patientId)
        .eq('provider_subscription_id', paymentId)
        .maybeSingle(),
    ])
    if (appointmentErr || subscriptionErr) throw appointmentErr ?? subscriptionErr

    const subscription = rawSubscription as unknown as ({
      patient_id: string; provider_subscription_id: string | null
      currency: string | null; price_cents: number | null; status: string
      tier: string; current_period_end: string | null
    } | null)

    if (!appointmentPayment && !subscription) return notFound('patient_payment_not_found')

    if (appointmentPayment?.status === 'approved') {
      return jsonOk({ status: 'approved', type: 'appointment', appointmentId: appointmentPayment.appointment_id })
    }
    if (subscription?.status === 'active') {
      return jsonOk({ status: 'approved', type: 'subscription' })
    }

    const token = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
      ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
      ?? import.meta.env?.MERCADOPAGO_ACCESS_TOKEN

    if (!token) {
      return jsonOk({ status: appointmentPayment?.status ?? subscription?.status ?? 'pending', statusDetail: 'provider_unavailable' })
    }

    const res = await fetch(`${MERCADOPAGO_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      logger.warn('[pix/status] PSP lookup not available', { status: res.status })
      return jsonOk({ status: appointmentPayment?.status ?? subscription?.status ?? 'pending', statusDetail: 'provider_unavailable' })
    }

    const provider = (await res.json()) as PixProviderEvidence

    if (appointmentPayment) {
      const local: LocalAppointmentPaymentEvidence = appointmentPayment
      if (!isMatchingApprovedPixAppointment(provider, local, paymentId, patientContext.patientId)) {
        return jsonOk({ status: local.status, type: 'appointment', statusDetail: 'payment_evidence_mismatch_or_pending' })
      }

      const { data: updated, error: updateError } = await admin.from('appointment_payments')
        .update({
          status: 'approved',
          paid_at: provider.date_approved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentPayment.id)
        .eq('patient_id', patientContext.patientId)
        .eq('provider_payment_id', paymentId)
        .eq('status', 'pending')
        .select('appointment_id')
        .maybeSingle()
      if (updateError) throw updateError

      if (updated) {
        // A late payment must NOT overwrite no_show, cancelled, in_progress or completed.
        const { error: appointmentError } = await admin.from('appointments')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', updated.appointment_id)
          .eq('patient_id', patientContext.patientId)
          .in('status', ['payment_pending', 'scheduled'])
        if (appointmentError) throw appointmentError
      }

      return jsonOk({ status: 'approved', type: 'appointment', appointmentId: appointmentPayment.appointment_id })
    }

    if (!subscription || !isMatchingApprovedPixSubscription(provider, paymentId, patientContext.patientId, subscription)) {
      return jsonOk({ status: subscription?.status ?? 'pending', type: 'subscription', statusDetail: 'payment_evidence_mismatch_or_pending' })
    }

    const { data: activated, error: activationError } = await admin.from('patient_subscriptions' as never)
      .update({
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq('patient_id', patientContext.patientId)
      .eq('provider_subscription_id', paymentId)
      .eq('status', 'trialing')
      .select('patient_id')
      .maybeSingle()
    if (activationError) throw activationError

    if (activated) {
      const { error: reserveError } = await admin.rpc('ensure_patient_health_reserve' as never, {
        p_patient_id: patientContext.patientId,
      } as never)
      if (reserveError) logger.error('[pix/status] health reserve failed after subscription activation', reserveError)
    }

    return jsonOk({ status: 'approved', type: 'subscription' })
  } catch (error) {
    logger.error('[pix/status] GET failed', error)
    return internalError('failed_to_check_pix_status')
  }
}
