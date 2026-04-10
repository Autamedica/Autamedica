import type { APIRoute } from 'astro';
import { conversationLedgerAdapter } from '@/lib/patients/lib/repos/conversation-ledger.adapter';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}

export const POST: APIRoute = async ({ request }) => {
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
  } catch (error: unknown) {
    console.error('Error recording conversation event', error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: APIRoute = async ({ request: _request, url }) => {
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
  } catch (error: unknown) {
    console.error('Error fetching conversation events', error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
