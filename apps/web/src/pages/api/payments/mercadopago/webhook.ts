import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service'

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const signature = request.headers.get('x-signature')
    const rawBody = await request.text()

    if (!appointmentPaymentsService.validateWebhookSignature(signature, rawBody)) {
      logger.warn('[payments/webhook] Invalid signature')
      return unauthorized('invalid_webhook_signature')
    }

    const payload = JSON.parse(rawBody) as {
      type?: string
      data?: { id?: string }
    }

    if (!payload.type || !payload.data?.id) {
      return badRequest('missing_type_or_data_id')
    }

    const supabase = createAstroAdminClient(locals.runtime?.env)

    try {
      await appointmentPaymentsService.handleWebhookNotification(
        supabase,
        payload.type,
        payload.data.id,
      )
    } catch (processingErr) {
      logger.error('[payments/webhook] Processing error (acknowledged)', processingErr)
    }

    return jsonOk({ received: true })
  } catch (error) {
    logger.error('[payments/webhook] POST error', error)
    return jsonOk({ received: true })
  }
}
