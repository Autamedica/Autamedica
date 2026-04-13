/**
 * POST /api/doctors/billing/webhook
 * MercadoPago webhook handler for payment and subscription notifications.
 * No auth — validated via webhook signature.
 * Uses admin client (service_role) because the request comes from MP, not a user.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, badRequest, unauthorized, internalError } from '@/lib/api-helpers';
import { billingService } from '@/lib/doctors/services/billing.service';
import { createAstroAdminClient } from '@/lib/supabase';
import type { MercadoPagoWebhookPayload } from '@autamedica/types';

export const POST: APIRoute = async ({ request }) => {
  try {
    const signature = request.headers.get('x-signature');
    const rawBody = await request.text();

    if (!billingService.validateWebhookSignature(signature, rawBody)) {
      logger.warn('[billing/webhook] Invalid signature');
      return unauthorized('invalid_webhook_signature');
    }

    let payload: MercadoPagoWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as MercadoPagoWebhookPayload;
    } catch {
      return badRequest('invalid_json');
    }

    if (!payload.type || !payload.data?.id) {
      return badRequest('missing_type_or_data_id');
    }

    const supabase = createAstroAdminClient();

    await billingService.handlePaymentWebhook(
      supabase,
      payload.type,
      payload.data.id,
    );

    // MercadoPago espera 200 para confirmar recepción
    return jsonOk({ received: true });
  } catch (err) {
    logger.error('[billing/webhook] POST error', err);
    return internalError();
  }
};
