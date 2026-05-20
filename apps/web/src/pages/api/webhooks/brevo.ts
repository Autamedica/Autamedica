import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';

export const POST: APIRoute = async (context) => {
  try {
    const supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL || context.locals?.runtime?.env?.PUBLIC_SUPABASE_URL) as string;
    const supabaseKey = (import.meta.env.SUPABASE_SERVICE_ROLE_KEY || context.locals?.runtime?.env?.SUPABASE_SERVICE_ROLE_KEY) as string;

    if (!supabaseUrl || !supabaseKey) {
      logger.error('[Webhook Brevo] Missing Supabase credentials');
      return new Response(JSON.stringify({ error: 'Configuration Error' }), { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await context.request.json();
    logger.info('[Webhook Brevo] Evento recibido');

    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      const email = event.email || 'desconocido';
      const eventType = event.event || 'unknown';
      const messageId = event['message-id'] || event.messageId || null;
      const subject = event.subject || null;
      
      const metadata = { ...event };
      delete metadata.email;
      delete metadata.event;

      await supabase.from('email_events_log').insert({
        email,
        event_type: eventType,
        provider: 'brevo',
        provider_message_id: messageId,
        subject,
        metadata
      });
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    logger.error('[Webhook Brevo] Error procesando payload', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
