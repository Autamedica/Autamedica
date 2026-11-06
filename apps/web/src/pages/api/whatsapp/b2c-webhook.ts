import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAstroAdminClient } from '@/lib/supabase';
import { isExplicitOptOut, normalizeArPhone } from '@/lib/b2c/whatsapp-crm';

/**
 * Read-only WhatsApp Cloud API/Business App coexistence ingestion.
 * No message sending, no clinical content stored, no auto-creation of unknown contacts.
 * Requires Meta Embedded Signup/Coexistence + WhatsApp webhook configuration.
 */
export const prerender = false;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
type RuntimeEnv = Record<string, unknown> | null | undefined;

function secret(env: RuntimeEnv, key: string): string {
  const value = env?.[key];
  if (typeof value === 'string' && value.length) return value;
  const buildValue = import.meta.env[key];
  return typeof buildValue === 'string' ? buildValue : '';
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function verifyMetaSignature(body: string, signature: string | null, appSecret: string): Promise<boolean> {
  if (!appSecret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = 'sha256=' + Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(expected.toLowerCase(), signature.toLowerCase());
}

type MetaMessage = { id?: string; from?: string; to?: string; type?: string; text?: { body?: string } };
type MetaStatus = { id?: string; recipient_id?: string; status?: string };
type MetaValue = {
  messaging_product?: string; messages?: MetaMessage[]; statuses?: MetaStatus[];
  smb_message_echoes?: MetaMessage[]; metadata?: { phone_number_id?: string };
};
type MetaPayload = {
  object?: string;
  entry?: Array<{ changes?: Array<{ field?: string; value?: MetaValue }> }>;
};

export const GET: APIRoute = async ({ request, locals }) => {
  const token = secret(locals.runtime?.env, 'META_WHATSAPP_VERIFY_TOKEN');
  if (!token) return json({ error: 'webhook_not_configured' }, 503);
  const query = new URL(request.url).searchParams;
  const challenge = query.get('hub.challenge');
  if (query.get('hub.mode') !== 'subscribe' || !challenge ||
      !constantTimeEqual(query.get('hub.verify_token') || '', token)) return json({ error: 'forbidden' }, 403);
  return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const appSecret = secret(locals.runtime?.env, 'META_WHATSAPP_APP_SECRET');
  const expectedPhoneId = secret(locals.runtime?.env, 'META_WHATSAPP_PHONE_NUMBER_ID');
  if (!appSecret || !expectedPhoneId) return json({ error: 'webhook_not_configured' }, 503);
  const raw = await request.text();
  if (raw.length > 512_000) return json({ error: 'payload_too_large' }, 413);
  const verified = await verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), appSecret);
  if (!verified) return json({ error: 'invalid_signature' }, 403);
  let payload: MetaPayload;
  try { payload = JSON.parse(raw) as MetaPayload; } catch { return json({ error: 'invalid_json' }, 400); }
  if (payload.object !== 'whatsapp_business_account') return json({ ignored: true });
  const db = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
  let processed = 0;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value || value.metadata?.phone_number_id !== expectedPhoneId) continue;
      // Meta sends SMB outbound echoes through the smb_message_echoes field.
      // They must not be interpreted as customer replies.
      const echoField = change.field === 'smb_message_echoes';
      const inbound = echoField ? [] : (value.messages || []);
      const echoes = echoField ? (value.messages || value.smb_message_echoes || []) : (value.smb_message_echoes || []);
      for (const { message, isEcho } of [
        ...inbound.map(message => ({ message, isEcho: false })),
        ...echoes.map(message => ({ message, isEcho: true })),
      ]) {
        if (!message.id) continue;
        const to = message as MetaMessage & { recipient_id?: string };
        const phone = normalizeArPhone(isEcho ? (to.to || to.recipient_id) : message.from);
        if (!phone) continue;
        const eventType = isEcho ? 'app_echo'
          : isExplicitOptOut(message.text?.body) ? 'inbound_opt_out' : 'inbound_message';
        const { data, error } = await db.rpc('record_b2c_whatsapp_event', {
          p_phone_e164: phone, p_event_type: eventType, p_provider_message_id: message.id,
        });
        if (error) return json({ error: 'event_write_failed' }, 500);
        if (data === true) processed++;
      }
      for (const status of value.statuses || []) {
        if (!status.id || !['delivered','read'].includes(status.status || '')) continue;
        const phone = normalizeArPhone(status.recipient_id);
        if (!phone) continue;
        const { error } = await db.rpc('record_b2c_whatsapp_event', {
          p_phone_e164: phone, p_event_type: status.status, p_provider_message_id: status.id,
        });
        if (error) return json({ error: 'status_write_failed' }, 500);
      }
    }
  }
  return json({ ok: true, processed });
};
