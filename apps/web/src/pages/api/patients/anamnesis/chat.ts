import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { processAnamnesisChat } from '@/lib/patients/services/anamnesis-chat.service';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { unauthorized } from '@/lib/api-helpers';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) return unauthorized();
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') {
    return json({ success: false, error: 'invalid_json' }, 400);
  }

  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  const checkpoint = raw.checkpoint === 'final' || raw.checkpoint === 'partial'
    ? raw.checkpoint
    : null;
  const history = Array.isArray(raw.history)
    ? raw.history.filter((entry): entry is { role: 'user' | 'assistant'; content: string } =>
        entry &&
        typeof entry === 'object' &&
        (entry.role === 'user' || entry.role === 'assistant') &&
        typeof entry.content === 'string',
      )
    : [];

  if (!message) {
    return json({ success: false, error: 'message_required' }, 400);
  }

  if (!checkpoint) {
    return json({ success: false, error: 'checkpoint_required' }, 400);
  }

  try {
    const result = await processAnamnesisChat(message, history, checkpoint, {
      guidanceQuestions: Array.isArray(raw.guidanceQuestions)
        ? raw.guidanceQuestions.filter((value): value is string => typeof value === 'string')
        : [],
      coverageGaps: Array.isArray(raw.coverageGaps)
        ? raw.coverageGaps.filter((value): value is string => typeof value === 'string')
        : [],
      coverageSummary: typeof raw.coverageSummary === 'string' ? raw.coverageSummary : undefined,
    });

    return json({ success: true, ...result });
  } catch (error) {
    logger.error('[anamnesis-chat] Failed', error);

    if (error instanceof Error && error.message.includes('GEMINI_API_KEY')) {
      return json({ success: false, error: 'ai_not_configured' }, 503);
    }

    return json({ success: false, error: 'anamnesis_chat_failed' }, 500);
  }
};
