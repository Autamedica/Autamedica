import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const authHeader = request.headers.get('authorization') ?? ''
    const webhookSecret = locals.runtime?.env?.RESERVA_SAUDE_WEBHOOK_SECRET || 'dev_secret'
    
    // Validar secret o header de autorización
    if (authHeader.replace(/^Bearer\s+/i, '') !== webhookSecret && request.headers.get('x-webhook-secret') !== webhookSecret) {
      // Si estamos en desarrollo local permitimos si no hay secret configurado, en prod exigimos auth
      if (locals.runtime?.env?.NODE_ENV === 'production') {
        return unauthorized('invalid_webhook_secret')
      }
    }

    const body = await request.json()
    const { 
      patientId, 
      subscriptionId, 
      tier = 'cuidado', 
      usedMonthlyBenefit = false,
      appointmentId = null,
      eventType = 'payment_succeeded'
    } = body

    if (!patientId) {
      return badRequest('patientId is required')
    }

    if (eventType !== 'payment_succeeded' && eventType !== 'subscription_renewed') {
      return jsonOk({ received: true, ignored: true, reason: 'unhandled_event_type' })
    }

    const admin = createAstroAdminClient(locals.runtime?.env)

    // Llamar a la RPC atómica e idempotente de devengamiento
    const { data: result, error } = await admin.rpc('process_monthly_reserve_accrual' as never, {
      p_patient_id: patientId,
      p_subscription_id: subscriptionId || `sub_${patientId}`,
      p_tier: tier,
      p_used_monthly_benefit: Boolean(usedMonthlyBenefit),
      p_appointment_id: appointmentId,
    } as never)

    if (error) throw error

    logger.info('[webhooks/reserva-saude-subscription] Processed successfully', {
      patientId,
      tier,
      result,
    })

    return jsonOk({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error('[webhooks/reserva-saude-subscription] POST error', error)
    return internalError('failed_to_process_subscription_webhook')
  }
}
