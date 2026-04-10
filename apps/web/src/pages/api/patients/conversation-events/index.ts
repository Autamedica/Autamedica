import type { APIRoute } from 'astro';
import { conversationLedgerAdapter } from '@/lib/patients/lib/repos/conversation-ledger.adapter';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();

    if (!body.sessionId || !body.patientId || !body.rawText) {
      return new Response(JSON.stringify({ error: 'Missing required event parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const event = await conversationLedgerAdapter.logEvent(body);

    return new Response(JSON.stringify({ event }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error recording conversation event', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing sessionId query param' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const events = await conversationLedgerAdapter.getEventsForSession(sessionId);

    return new Response(JSON.stringify({ events }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error fetching conversation events', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
