import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { createConversationLedgerAdapter } from '@/lib/patients/lib/repos/conversation-ledger.adapter';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();

    // Map frontend 'user' role to DB-compatible 'patient'
    const rawRole = typeof body.role === 'string' ? body.role : 'patient';
    const normalizedRole = rawRole === 'user' ? 'patient' : rawRole;

    const eventPayload = {
      sessionId: body.sessionId,
      caseId: body.caseId,
      patientId: body.patientId,
      role: normalizedRole,
      channel: body.channel,
      eventType: body.eventType ?? body.event_type,
      segment: body.segment,
      rawText: body.rawText,
      normalizedText: body.normalizedText ?? body.normalized_text,
      extractedFields: body.extractedFields ?? body.extracted_fields,
      plannerOutput: body.plannerOutput ?? body.planner_output,
      promptSnapshotText: body.promptSnapshotText ?? body.prompt_snapshot_text,
      modelName: body.modelName ?? body.model_name,
      modelVersion: body.modelVersion ?? body.model_version,
      extractionConfidence: body.extractionConfidence ?? body.extraction_confidence,
      latencyMs: body.latencyMs ?? body.latency_ms,
      errorCode: body.errorCode ?? body.error_code,
      errorMessage: body.errorMessage ?? body.error_message,
      metadata: body.metadata,
    };

    if (!eventPayload.sessionId || !eventPayload.patientId || !eventPayload.rawText || !eventPayload.eventType) {
      return new Response(JSON.stringify({ error: 'Missing required event parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const adapter = createConversationLedgerAdapter(createAstroAdminClient(locals.runtime?.env));
    const event = await adapter.logEvent(eventPayload);

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

export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing sessionId query param' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const adapter = createConversationLedgerAdapter(createAstroAdminClient(locals.runtime?.env));
    const events = await adapter.getEventsForSession(sessionId);

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
