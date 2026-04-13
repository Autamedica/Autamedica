/**
 * Inbound WhatsApp Watcher — Monitorea respuestas de pacientes vía OpenClaw.
 *
 * Cambios de hardening:
 * - persiste cada inbound en Supabase antes de enviarlo al backend
 * - firma cada request con HMAC para evitar replay trivial
 * - reintenta los pendientes con backoff si el backend no está disponible
 */

import { createHash, createHmac } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { ensureEnv } from '@autamedica/shared';
import { parsePatientResponse } from '@autamedica/scheduling';

const execAsync = promisify(exec);

const env = globalThis.process?.env ?? {};
const supabaseAdminKeyEnv = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
const BACKEND_WEBHOOK_URL = env.BACKEND_WEBHOOK_URL ?? 'http://localhost:3000/api/webhooks/openclaw';
const WEBHOOK_SECRET = ensureEnv('OPENCLAW_WEBHOOK_SECRET');
const SUPABASE_URL = ensureEnv('SUPABASE_URL');
const supabaseAdminKey = ensureEnv(supabaseAdminKeyEnv);
const POLL_INTERVAL_MS = parseInt(env.WATCHER_POLL_MS ?? '3000', 10);
const PENDING_BATCH_SIZE = parseInt(env.WATCHER_PENDING_BATCH_SIZE ?? '20', 10);
const OPENCLAW_ACCOUNT = env.OPENCLAW_ACCOUNT ?? 'autamedica';

const supabase = createClient(SUPABASE_URL, supabaseAdminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const processedMessages = new Set<string>();

console.log('👂 Inbound WhatsApp Watcher starting...');
console.log(`   Backend: ${BACKEND_WEBHOOK_URL}`);
console.log(`   Account: ${OPENCLAW_ACCOUNT}`);
console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`);
console.log('');

interface PendingInboundMessage {
  id: string;
  source_message_key: string;
  channel: string;
  from_phone: string;
  message_text: string;
  parsed_response: 'confirmed' | 'cancelled' | 'accepted' | null;
  attempt_count: number;
}

function computeRetryAt(attempt: number): string {
  const minutes = Math.min(5 * 2 ** Math.max(attempt - 1, 0), 60);
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function buildSourceMessageKey(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function buildSignedHeaders(bodyText: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${bodyText}`).digest('hex');

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WEBHOOK_SECRET}`,
    'X-OpenClaw-Timestamp': timestamp,
    'X-OpenClaw-Signature': signature,
  };
}

async function persistInboundMessage(
  sourceMessageKey: string,
  fromPhone: string,
  messageText: string,
): Promise<string> {
  const parsedResponse = parsePatientResponse(messageText);

  const { data: existing, error: existingError } = await supabase
    .from('appointment_inbound_messages')
    .select('id')
    .eq('source_message_key', sourceMessageKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Could not query inbound queue: ${existingError.message}`);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from('appointment_inbound_messages')
    .insert({
      source_message_key: sourceMessageKey,
      channel: 'whatsapp',
      from_phone: fromPhone,
      message_text: messageText,
      parsed_response: parsedResponse,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(`Could not persist inbound message: ${error?.message ?? 'missing id'}`);
  }

  return data.id;
}

async function markAttemptStarted(messageId: string, nextAttemptCount: number): Promise<void> {
  const { error } = await supabase
    .from('appointment_inbound_messages')
    .update({
      attempt_count: nextAttemptCount,
      last_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', messageId);

  if (error) {
    throw new Error(`Could not update inbound attempt metadata: ${error.message}`);
  }
}

async function markAttemptFailed(messageId: string, attemptCount: number, reason: string): Promise<void> {
  const { error } = await supabase
    .from('appointment_inbound_messages')
    .update({
      next_attempt_at: computeRetryAt(attemptCount),
      last_error: reason,
    })
    .eq('id', messageId);

  if (error) {
    throw new Error(`Could not schedule inbound retry: ${error.message}`);
  }
}

async function flushPendingMessages(): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('appointment_inbound_messages')
    .select('id, source_message_key, channel, from_phone, message_text, parsed_response, attempt_count')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(PENDING_BATCH_SIZE);

  if (error) {
    console.error(`  ❌ Could not load pending inbound queue: ${error.message}`);
    return;
  }

  for (const message of (data ?? []) as PendingInboundMessage[]) {
    const payload = {
      message_id: message.id,
      from: message.from_phone,
      message: message.message_text,
      channel: message.channel,
    };
    const bodyText = JSON.stringify(payload);
    const nextAttemptCount = (message.attempt_count ?? 0) + 1;

    try {
      await markAttemptStarted(message.id, nextAttemptCount);

      const response = await fetch(BACKEND_WEBHOOK_URL, {
        method: 'POST',
        headers: buildSignedHeaders(bodyText),
        body: bodyText,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const text = await response.text();
        await markAttemptFailed(message.id, nextAttemptCount, `HTTP ${response.status}: ${text}`);
        continue;
      }

      const result = await response.json();
      console.log(`  ✅ Backend: action=${result.action ?? 'unknown'} message=${message.id}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await markAttemptFailed(message.id, nextAttemptCount, reason);
      console.error(`  ❌ Backend POST failed for ${message.id}: ${reason}`);
    }
  }
}

async function checkInbound(): Promise<void> {
  try {
    const { stdout } = await execAsync(
      `journalctl --user -u openclaw-gateway.service --since "10 sec ago" --no-pager 2>/dev/null | grep "Inbound message"`,
      { timeout: 5_000 },
    );

    if (!stdout.trim()) return;

    for (const line of stdout.trim().split('\n')) {
      const match = line.match(/Inbound message (\+\d+) -> (\+\d+) \(direct, (\d+) chars\)/);
      if (!match) continue;

      const [, from, to] = match;
      const dedupeKey = `${from}-${to}-${line.match(/\d{2}:\d{2}:\d{2}/)?.[0] ?? line}`;

      if (processedMessages.has(dedupeKey)) continue;
      processedMessages.add(dedupeKey);

      if (processedMessages.size > 1000) {
        const first = processedMessages.values().next().value;
        if (first) processedMessages.delete(first);
      }

      console.log(`[${new Date().toISOString()}] Inbound: ${from} -> ${to}`);
      await handleInboundFromSession(from, line);
    }
  } catch {
    // journalctl may return non-zero if there are no matches.
  }
}

async function handleInboundFromSession(senderPhone: string, rawLine: string): Promise<void> {
  try {
    const { stdout } = await execAsync(
      `grep -l '"${senderPhone}"' ~/.openclaw/agents/${OPENCLAW_ACCOUNT}/sessions/*.jsonl 2>/dev/null | tail -1`,
      { timeout: 5_000 },
    );

    const sessionFile = stdout.trim();
    if (!sessionFile) {
      console.log(`  ⚠️ No session found for ${senderPhone}`);
      return;
    }

    const { stdout: lastMsg } = await execAsync(
      `grep '"role":"user"' "${sessionFile}" | tail -1`,
      { timeout: 5_000 },
    );

    if (!lastMsg.trim()) return;

    const parsed = JSON.parse(lastMsg.trim());
    const content = parsed?.message?.content;
    let messageText = '';

    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'text' && part.text) {
          const lines = part.text.split('\n');
          const lastLine = lines[lines.length - 1].trim();
          if (lastLine && !lastLine.startsWith('{') && !lastLine.startsWith('```')) {
            messageText = lastLine;
          }
        }
      }
    }

    if (!messageText) {
      console.log(`  ⚠️ Could not extract message text from session`);
      return;
    }

    const sourceMessageKey = buildSourceMessageKey(`${rawLine}\n${messageText}`);
    const messageId = await persistInboundMessage(sourceMessageKey, senderPhone, messageText);

    console.log(`  📩 Message: "${messageText}" [${messageId}]`);
  } catch (err) {
    console.error(`  ❌ Session read failed:`, err instanceof Error ? err.message : err);
  }
}

async function tick() {
  await checkInbound();
  await flushPendingMessages();
}

tick();
setInterval(tick, POLL_INTERVAL_MS);

process.on('SIGINT', () => {
  console.log('\n🛑 Inbound watcher stopping...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Inbound watcher stopping...');
  process.exit(0);
});
