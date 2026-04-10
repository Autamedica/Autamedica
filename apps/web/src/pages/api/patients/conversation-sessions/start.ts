import type { APIRoute } from 'astro';
import { conversationLedgerAdapter } from '@/lib/patients/lib/repos/conversation-ledger.adapter';

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

    const session = await conversationLedgerAdapter.createSession({
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
  } catch (error: any) {
    console.error('Error in /api/patients/conversation-sessions/start', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
