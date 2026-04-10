import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { createConversationLedgerAdapter } from '@/lib/patients/lib/repos/conversation-ledger.adapter';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    
    if (!body.sessionId || !body.status) {
      return new Response(JSON.stringify({ error: 'Missing sessionId or status' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const adapter = createConversationLedgerAdapter(createAstroAdminClient(locals.runtime?.env));
    await adapter.closeSession(body.sessionId, body.status);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in /api/patients/conversation-sessions/close', error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
