import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service'

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url)
    const signature = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id')
    const rawBody = await request.text()

    let payload: {
      type?: string
      data?: { id?: string }
    }

    try {
      payload = rawBody.trim()
        ? JSON.parse(rawBody) as {
          type?: string
          data?: { id?: string }
        }
        : {}
    } catch {
      return badRequest('invalid_json')
    }
    const type = payload.type ?? url.searchParams.get('type') ?? undefined
    const dataId = payload.data?.id ?? url.searchParams.get('data.id') ?? undefined

    if (!dataId || !type) {
      return badRequest('missing_type_or_data_id')
    }

    const isValidSignature = await appointmentPaymentsService.validateWebhookSignature({
      signature,
      requestId,
      dataId,
    })

    if (!isValidSignature) {
      logger.warn('[payments/webhook] Invalid signature')
      return unauthorized('invalid_webhook_signature')
    }

    const supabase = createAstroAdminClient(locals.runtime?.env)

    await appointmentPaymentsService.handleWebhookNotification(
      supabase,
      type,
      dataId,
    )

    return jsonOk({ received: true })
  } catch (error) {
    logger.error('[payments/webhook] POST error', error)
    return internalError('webhook_processing_failed')
  }
}
