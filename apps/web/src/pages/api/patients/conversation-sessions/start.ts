import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { createConversationLedgerAdapter } from '@/lib/patients/lib/repos/conversation-ledger.adapter';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    
    // Validate session input (simplified for this design)
    if (!body.patientId || !body.caseId || !body.channel || !body.workflowType) {
      return new Response(JSON.stringify({ error: 'Missing required session parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const adapter = createConversationLedgerAdapter(createAstroAdminClient(locals.runtime?.env));

    const session = await adapter.createSession({
      patientId: body.patientId,
      caseId: body.caseId,
      channel: body.channel,
      workflowType: body.workflowType,
      status: 'active',
    });

    return new Response(JSON.stringify({ session }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in /api/patients/conversation-sessions/start', error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
