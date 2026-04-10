import type { APIRoute } from 'astro';
import { conversationLedgerAdapter } from '@/lib/patients/lib/repos/conversation-ledger.adapter';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    
    if (!body.sessionId || !body.status) {
      return new Response(JSON.stringify({ error: 'Missing sessionId or status' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await conversationLedgerAdapter.closeSession(body.sessionId, body.status);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in /api/patients/conversation-sessions/close', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
