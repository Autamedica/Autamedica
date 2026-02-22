import { NextResponse } from 'next/server';
import { logger } from '@autamedica/shared';
import { intentClassifier } from '@/lib/ai/intent-classifier';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text: string | undefined = body?.text;
    if (!text || text.trim().length === 0) return NextResponse.json({ ok: false, error: 'text_required' }, { status: 400 });
    const result = intentClassifier.classify(text);
    return NextResponse.json({ ok: true, data: { intent: result.intent, confidence: result.confidence, score: result.confidence } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'internal_error';
    logger.error('[AI] intent POST error', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
