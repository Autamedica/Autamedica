import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL!,
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
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
