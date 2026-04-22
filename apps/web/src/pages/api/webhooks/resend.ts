/**
 * POST /api/webhooks/resend
 * Resend webhook receiver.
 * Verifies Svix signature headers and stores normalized events in growth_os.email_events.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type ResendWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function resolveWebhookSecret(runtimeEnv?: Record<string, unknown> | null): string {
  return (
    (runtimeEnv?.RESEND_WEBHOOK_SECRET as string | undefined) ??
    import.meta.env.RESEND_WEBHOOK_SECRET ??
    ''
  );
}

function decodeSvixSecret(secret: string): ArrayBuffer {
  const normalized = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function base64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

async function signSvixPayload(secret: string, signedPayload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    decodeSvixSecret(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  return base64(signature);
}

function parseSignatures(signatureHeader: string): string[] {
  return signatureHeader
    .split(' ')
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.startsWith('v1,') ? part.slice(3) : part)
    .filter((part) => part && part !== 'v1');
}

async function isValidSvixRequest(request: Request, rawBody: string, secret: string): Promise<boolean> {
  const messageId = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');

  if (!messageId || !timestamp || !signature || !secret) return false;

  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - tsSeconds);
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = await signSvixPayload(secret, `${messageId}.${timestamp}.${rawBody}`);
  return parseSignatures(signature).some((candidate) => timingSafeEqual(candidate, expected));
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstEmail(value: unknown): string | null {
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string');
    return typeof first === 'string' ? first.toLowerCase() : null;
  }
  return null;
}

function allEmails(value: unknown): string[] {
  if (typeof value === 'string') return [value.toLowerCase()];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase());
  }
  return [];
}

function occurredAt(payload: ResendWebhookPayload): string | null {
  const createdAt = stringValue(payload.created_at);
  if (createdAt) return createdAt;
  const dataCreatedAt = stringValue(payload.data?.created_at);
  return dataCreatedAt;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const rawBody = await request.text();
  const secret = resolveWebhookSecret(locals.runtime?.env);

  if (!secret) {
    logger.error('[resend-webhook] Missing RESEND_WEBHOOK_SECRET');
    return json({ error: 'webhook_secret_not_configured' }, 500);
  }

  if (!(await isValidSvixRequest(request, rawBody, secret))) {
    logger.warn('[resend-webhook] Invalid signature');
    return json({ error: 'invalid_signature' }, 401);
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const eventType = stringValue(payload.type);
  if (!eventType) {
    return json({ error: 'missing_event_type' }, 400);
  }

  const data = payload.data ?? {};
  const providerEventId = request.headers.get('svix-id');
  const recipientEmails = allEmails(data.to ?? data.email);
  const recipientEmail = firstEmail(data.to ?? data.email);
  const messageId = stringValue(data.email_id) ?? stringValue(data.id) ?? stringValue(data.message_id);
  const broadcastId = stringValue(data.broadcast_id);
  const subject = stringValue(data.subject);
  const fromEmail = firstEmail(data.from);

  const admin = createAstroAdminClient(locals.runtime?.env);
  const { error } = await (admin as any)
    .schema('growth_os')
    .from('email_events')
    .upsert(
      {
        provider: 'resend',
        provider_event_id: providerEventId,
        event_type: eventType,
        message_id: messageId,
        broadcast_id: broadcastId,
        subject,
        from_email: fromEmail,
        recipient_email: recipientEmail,
        recipient_emails: recipientEmails,
        tags: data.tags ?? {},
        occurred_at: occurredAt(payload),
        payload,
        processed_at: new Date().toISOString(),
        processing_error: null,
      },
      { onConflict: 'provider,provider_event_id' },
    );

  if (error) {
    logger.error('[resend-webhook] Failed to store event', { eventType, providerEventId, error });
    return json({ error: 'store_failed' }, 500);
  }

  return json({ received: true });
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, svix-id, svix-timestamp, svix-signature',
    },
  });
};
