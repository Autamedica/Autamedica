/**
 * POST /api/doctors/billing/webhook
 * MercadoPago webhook handler for payment and subscription notifications.
 * No auth — validated via webhook signature.
 * Uses admin client (service_role) because the request comes from MP, not a user.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, badRequest, unauthorized } from '@/lib/api-helpers';
import { billingService } from '@/lib/doctors/services/billing.service';
import { createAstroAdminClient } from '@/lib/supabase';
import type { MercadoPagoWebhookPayload } from '@autamedica/types';

export const POST: APIRoute = async ({ request, locals }) => {
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

    const supabase = createAstroAdminClient(locals.runtime?.env);

    // MercadoPago espera 200 siempre — procesar y loguear errores sin devolver 500
    try {
      await billingService.handlePaymentWebhook(
        supabase,
        payload.type,
        payload.data.id,
      );
    } catch (processingErr) {
      logger.error('[billing/webhook] Processing error (acknowledged)', processingErr);
    }

    return jsonOk({ received: true });
  } catch (err) {
    // Error en parsing/validación — loguear pero devolver 200 para evitar retries de MP
    logger.error('[billing/webhook] POST error', err);
    return jsonOk({ received: true });
  }
};
