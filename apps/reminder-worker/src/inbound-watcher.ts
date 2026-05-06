/**
 * Inbound WhatsApp Watcher — recibe respuestas de pacientes via OpenClaw.
 *
 * Dos caminos de ingesta (el primero que dispare gana):
 * 1. HTTP hook directo desde OpenClaw (preferido): POST /hooks/whatsapp-inbound
 *    Configurar en ~/.openclaw/openclaw.json:
 *      "hooks": { "enabled": true, "url": "http://127.0.0.1:{PORT}/hooks/whatsapp-inbound", "token": "<OPENCLAW_HOOK_TOKEN>" }
 * 2. Streaming de journalctl como fallback (legacy): parsea el log del gateway.
 *
 * Todo inbound se persiste en appointment_inbound_messages (idempotencia via source_message_key)
 * y se flushea al backend con HMAC+timestamp.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ensureEnv } from '@autamedica/shared';
import { parsePatientResponse } from '@autamedica/scheduling';
import { sdReady, sdWatchdog, sdStopping, sdStatus, underSystemd } from './sd-notify';
import { processAudioForPhone } from './audio-watcher';

const env = globalThis.process?.env ?? {};

const BACKEND_WEBHOOK_URL = env.BACKEND_WEBHOOK_URL ?? 'http://localhost:3000/api/webhooks/openclaw';
const WEBHOOK_SECRET = ensureEnv('OPENCLAW_WEBHOOK_SECRET');
const SUPABASE_URL = ensureEnv('SUPABASE_URL');
const SUPABASE_KEY = ensureEnv('SUPABASE_SERVICE_ROLE_KEY');
const POLL_INTERVAL_MS = parseInt(env.WATCHER_POLL_MS ?? '3000', 10);
const PENDING_BATCH_SIZE = parseInt(env.WATCHER_PENDING_BATCH_SIZE ?? '20', 10);
const OPENCLAW_ACCOUNT = env.OPENCLAW_ACCOUNT ?? 'autamedica';
const HOOK_PORT = parseInt(env.WATCHER_HOOK_PORT ?? '18790', 10);
const OPENCLAW_HOOK_TOKEN = env.OPENCLAW_HOOK_TOKEN ?? '';
const JOURNAL_FALLBACK = env.WATCHER_JOURNAL_FALLBACK !== 'false';
const HUMAN_TAKEOVER_MINUTES = parseInt(env.WATCHER_HUMAN_TAKEOVER_MINUTES ?? '15', 10);
const TAKEOVER_MS = HUMAN_TAKEOVER_MINUTES * 60_000;

if (!/^[a-zA-Z0-9_-]+$/.test(OPENCLAW_ACCOUNT)) {
  throw new Error(`Invalid OPENCLAW_ACCOUNT: must match [a-zA-Z0-9_-]+`);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('[INBOUND] watcher starting');
console.log(`[INBOUND] backend=${BACKEND_WEBHOOK_URL}`);
console.log(`[INBOUND] account=${OPENCLAW_ACCOUNT}`);
console.log(`[INBOUND] poll=${POLL_INTERVAL_MS}ms hookPort=${HOOK_PORT} journalFallback=${JOURNAL_FALLBACK} humanTakeover=${HUMAN_TAKEOVER_MINUTES}min`);

interface PendingInboundMessage {
  id: string;
  source_message_key: string;
  channel: string;
  from_phone: string;
  message_text: string;
  parsed_response: 'confirmed' | 'cancelled' | 'accepted' | 'menu_schedule' | 'menu_view' | 'menu_advisor' | 'health_check' | null;
  attempt_count: number;
  webhook_result?: {
    inbound_media?: InboundMediaPayload;
  } | null;
}

interface InboundMediaPayload {
  path?: string | null;
  type?: string | null;
  fileName?: string | null;
}

function computeRetryAt(attempt: number): string {
  const minutes = Math.min(5 * 2 ** Math.max(attempt - 1, 0), 60);
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function buildSourceMessageKey(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
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

async function getDeferralFor(peer: string): Promise<Date | null> {
  const { data, error } = await supabase
    .from('whatsapp_peer_activity')
    .select('last_human_outbound_at')
    .eq('peer', peer)
    .maybeSingle();

  if (error) {
    console.warn(`[INBOUND] peer activity lookup failed for ${peer}: ${error.message}`);
    return null;
  }
  if (!data?.last_human_outbound_at) return null;

  const lastHumanMs = new Date(data.last_human_outbound_at).getTime();
  const cutoffMs = lastHumanMs + TAKEOVER_MS;
  return cutoffMs > Date.now() ? new Date(cutoffMs) : null;
}

async function upsertHumanOutbound(peer: string, account: string, channel: string, ts: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_peer_activity')
    .upsert(
      { peer, account_id: account, channel, last_human_outbound_at: ts },
      { onConflict: 'peer' },
    );
  if (error) throw new Error(`upsert peer activity: ${error.message}`);
}

async function persistInboundMessage(
  sourceMessageKey: string,
  fromPhone: string,
  messageText: string,
  media?: InboundMediaPayload | null,
): Promise<{ id: string; created: boolean; deferredUntil: string | null }> {
  const parsedResponse = parsePatientResponse(messageText);
  const queueParsedResponse =
    parsedResponse === 'confirmed' || parsedResponse === 'cancelled' || parsedResponse === 'accepted'
      ? parsedResponse
      : null;

  const { data: existing, error: existingError } = await supabase
    .from('appointment_inbound_messages')
    .select('id, deferred_until')
    .eq('source_message_key', sourceMessageKey)
    .maybeSingle();

  if (existingError) throw new Error(`query inbound queue: ${existingError.message}`);
  if (existing?.id) {
    return { id: existing.id, created: false, deferredUntil: existing.deferred_until ?? null };
  }

  const deferralDate = await getDeferralFor(fromPhone);
  const deferredUntilIso = deferralDate ? deferralDate.toISOString() : null;

  const { data, error } = await supabase
    .from('appointment_inbound_messages')
    .insert({
      source_message_key: sourceMessageKey,
      channel: 'whatsapp',
      from_phone: fromPhone,
      message_text: messageText,
      parsed_response: queueParsedResponse,
      deferred_until: deferredUntilIso,
      webhook_result: media ? { inbound_media: media } : {},
    })
    .select('id')
    .single();

  if (error || !data?.id) throw new Error(`persist inbound: ${error?.message ?? 'missing id'}`);
  return { id: data.id, created: true, deferredUntil: deferredUntilIso };
}

async function markAttemptStarted(messageId: string, nextAttemptCount: number): Promise<void> {
  const { error } = await supabase
    .from('appointment_inbound_messages')
    .update({
      attempt_count: nextAttemptCount,
      next_attempt_at: new Date(Date.now() + 30000).toISOString(),
      last_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', messageId);
  if (error) throw new Error(`update attempt metadata: ${error.message}`);
}

async function markAttemptFailed(messageId: string, attemptCount: number, reason: string): Promise<void> {
  const { error } = await supabase
    .from('appointment_inbound_messages')
    .update({ next_attempt_at: computeRetryAt(attemptCount), last_error: reason })
    .eq('id', messageId);
  if (error) throw new Error(`schedule inbound retry: ${error.message}`);
}

async function markProcessed(messageId: string, result: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('appointment_inbound_messages')
    .update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      webhook_result: result,
      last_error: null,
    })
    .eq('id', messageId);
  if (error) throw new Error(`mark processed: ${error.message}`);
}

function getAudioMedia(message: PendingInboundMessage): InboundMediaPayload | null {
  const media = message.webhook_result?.inbound_media;
  if (!media?.path) return null;
  const type = media.type ?? '';
  const text = message.message_text.trim().toLowerCase();
  if (type.startsWith('audio/') || text === '<media:audio>') return media;
  return null;
}

async function processPendingAudioMessage(message: PendingInboundMessage): Promise<boolean> {
  const media = getAudioMedia(message);
  if (!media?.path) return false;

  const nextAttemptCount = (message.attempt_count ?? 0) + 1;
  try {
    await markAttemptStarted(message.id, nextAttemptCount);
    const result = await processAudioForPhone({
      filePath: media.path,
      phone: message.from_phone,
      mediaType: media.type,
      sourceMessageId: message.source_message_key,
    });

    await markProcessed(message.id, {
      action: 'anamnesis_audio_generated',
      preanamnesis_id: result.id,
      pdf_url: result.pdfUrl,
      storage_path: result.storagePath,
      inbound_media: media,
    });
    console.log(`[INBOUND] audio anamnesis generated id=${message.id} preanamnesis=${result.id}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await markAttemptFailed(message.id, nextAttemptCount, reason);
    console.error(`[INBOUND] audio processing failed id=${message.id}: ${reason}`);
  }

  return true;
}

async function promoteDeferredMessages(): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('appointment_inbound_messages')
    .select('id, from_phone, created_at, deferred_until')
    .eq('status', 'pending')
    .not('deferred_until', 'is', null)
    .lte('deferred_until', nowIso);

  if (error) {
    console.error(`[INBOUND] load expired deferred failed: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) return;

  const byPeer = new Map<string, typeof data>();
  for (const row of data) {
    const bucket = byPeer.get(row.from_phone) ?? [];
    bucket.push(row);
    byPeer.set(row.from_phone, bucket);
  }

  for (const [peer, rows] of byPeer) {
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const [newest, ...older] = rows;

    const { error: newErr } = await supabase
      .from('appointment_inbound_messages')
      .update({ deferred_until: null })
      .eq('id', newest.id);
    if (newErr) {
      console.error(`[INBOUND] promote deferred id=${newest.id} failed: ${newErr.message}`);
      continue;
    }
    console.log(`[INBOUND] promoted deferred id=${newest.id} peer=${peer}`);

    if (older.length > 0) {
      const olderIds = older.map((r) => r.id);
      const { error: oldErr } = await supabase
        .from('appointment_inbound_messages')
        .update({
          status: 'ignored',
          deferred_until: null,
          processed_at: new Date().toISOString(),
          webhook_result: { action: 'ignored', reason: 'superseded_by_newer_during_takeover' },
        })
        .in('id', olderIds);
      if (oldErr) {
        console.error(`[INBOUND] mark superseded failed peer=${peer}: ${oldErr.message}`);
      } else {
        console.log(`[INBOUND] superseded ${olderIds.length} older deferred rows peer=${peer}`);
      }
    }
  }
}

async function flushPendingMessages(): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('appointment_inbound_messages')
    .select('id, source_message_key, channel, from_phone, message_text, parsed_response, attempt_count, webhook_result')
    .eq('status', 'pending')
    .is('deferred_until', null)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(PENDING_BATCH_SIZE);

  if (error) {
    console.error(`[INBOUND] load pending queue failed: ${error.message}`);
    return;
  }

  for (const message of (data ?? []) as PendingInboundMessage[]) {
    if (await processPendingAudioMessage(message)) {
      continue;
    }

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

      const result = (await response.json()) as { action?: string };
      console.log(`[INBOUND] backend ok action=${result.action ?? 'unknown'} id=${message.id}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await markAttemptFailed(message.id, nextAttemptCount, reason);
      console.error(`[INBOUND] backend POST failed id=${message.id}: ${reason}`);
    }
  }
}

let lastJournalCursor: string | null = null;

async function ingestJournalWindow(): Promise<void> {
  const since = lastJournalCursor ?? new Date(Date.now() - 30_000).toISOString();
  const args = [
    '--user', '-u', 'openclaw-gateway.service',
    '--since', since,
    '--output=short-iso',
    '--no-pager',
  ];

  const proc = Bun.spawn(['journalctl', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  if (!text.trim()) return;

  let newestTs: string | null = null;

  for (const line of text.split('\n')) {
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})/);
    if (tsMatch) newestTs = tsMatch[1];

    const match = line.match(/Inbound message (\+\d+) -> (\+\d+) \(direct, (\d+) chars\)/);
    if (!match) continue;

    const [, from] = match;
    const logTs = tsMatch?.[1] ?? new Date().toISOString();
    await handleJournalInbound(from, logTs, line);
  }

  if (newestTs) {
    const next = new Date(new Date(newestTs).getTime() + 1).toISOString();
    lastJournalCursor = next;
  }
}

async function handleJournalInbound(senderPhone: string, logTs: string, rawLine: string): Promise<void> {
  try {
    const sessionDir = `${env.HOME}/.openclaw/agents/${OPENCLAW_ACCOUNT}/sessions`;
    const glob = new Bun.Glob('*.jsonl');
    let latestFile: string | null = null;
    let latestMtime = 0;

    for await (const name of glob.scan({ cwd: sessionDir, absolute: true })) {
      const stat = await Bun.file(name).stat();
      const mtime = stat.mtimeMs ?? 0;
      if (mtime <= latestMtime) continue;
      const content = await Bun.file(name).text();
      if (!content.includes(`"${senderPhone}"`)) continue;
      latestMtime = mtime;
      latestFile = name;
    }

    if (!latestFile) {
      console.log(`[INBOUND] no session for ${senderPhone}`);
      return;
    }

    const content = await Bun.file(latestFile).text();
    const logTsMs = new Date(logTs).getTime();
    let messageText = '';

    type JournalLine = {
      timestamp?: string
      message?: {
        role?: string
        content?: Array<{ type?: string; text?: string }>
      }
    }
    for (const jsonLine of content.trim().split('\n').reverse()) {
      let parsed: JournalLine | null = null
      try { parsed = JSON.parse(jsonLine) as JournalLine; } catch { continue; }
      if (parsed?.message?.role !== 'user') continue;

      const msgTs = parsed?.timestamp ? new Date(parsed.timestamp).getTime() : null;
      if (msgTs && Math.abs(msgTs - logTsMs) > 15_000) continue;

      const contentParts = parsed?.message?.content;
      if (Array.isArray(contentParts)) {
        for (const part of contentParts) {
          if (part?.type === 'text' && typeof part.text === 'string') {
            const lastLine = part.text.split('\n').at(-1)?.trim();
            if (lastLine && !lastLine.startsWith('{') && !lastLine.startsWith('```')) {
              messageText = lastLine;
            }
          }
        }
      }
      if (messageText) break;
    }

    if (!messageText) {
      console.log('[INBOUND] could not extract message text from session');
      return;
    }

    const sourceMessageKey = buildSourceMessageKey(`journal:${rawLine}\n${messageText}`);
    const { id, created } = await persistInboundMessage(sourceMessageKey, senderPhone, messageText);
    if (created) console.log(`[INBOUND] journal ingest id=${id} text="${messageText}"`);
  } catch (err) {
    console.error('[INBOUND] session read failed:', err instanceof Error ? err.message : err);
  }
}

let ticking = false;
let lastTickAt = Date.now();
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    if (JOURNAL_FALLBACK) await ingestJournalWindow();
    await promoteDeferredMessages();
    await flushPendingMessages();
    lastTickAt = Date.now();
  } catch (err) {
    console.error('[INBOUND] tick error:', err instanceof Error ? err.message : err);
  } finally {
    ticking = false;
  }
}

async function readHookBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; status: number; msg: string }> {
  if (OPENCLAW_HOOK_TOKEN) {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !safeEqualString(token, OPENCLAW_HOOK_TOKEN)) {
      return { ok: false, status: 401, msg: 'unauthorized' };
    }
  }
  try {
    const body = await req.json();
    return { ok: true, body };
  } catch {
    return { ok: false, status: 400, msg: 'invalid json' };
  }
}

const server = Bun.serve({
  port: HOOK_PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, ticking, cursor: lastJournalCursor });
    }

    if (url.pathname === '/healthz') {
      const { error } = await supabase
        .from('appointment_inbound_messages')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      if (error) return Response.json({ ok: false, supabase: error.message }, { status: 503 });
      return Response.json({ ok: true, ticking, lastTickAgoMs: Date.now() - lastTickAt });
    }

    if (url.pathname === '/hooks/whatsapp-inbound' && req.method === 'POST') {
      const parsed = await readHookBody(req);
      if (!parsed.ok) return new Response(parsed.msg, { status: parsed.status });

      const body = parsed.body as {
        from?: string;
        to?: string;
        text?: string;
        id?: string;
        ts?: string;
        mediaPath?: string;
        mediaType?: string;
        mediaFileName?: string;
      };
      if (!body.from || !body.text) return new Response('missing from/text', { status: 400 });

      const seed = body.id ? `hook:${body.id}` : `hook:${body.from}:${body.ts ?? ''}:${body.text}`;
      const sourceMessageKey = buildSourceMessageKey(seed);
      const media = body.mediaPath || body.mediaType
        ? {
            path: body.mediaPath ?? null,
            type: body.mediaType ?? null,
            fileName: body.mediaFileName ?? null,
          }
        : null;

      try {
        const { id, created, deferredUntil } = await persistInboundMessage(sourceMessageKey, body.from, body.text, media);
        if (created) {
          console.log(
            deferredUntil
              ? `[INBOUND] hook ingest id=${id} from=${body.from} DEFERRED until ${deferredUntil}`
              : `[INBOUND] hook ingest id=${id} from=${body.from}`,
          );
        }
        return Response.json({ ok: true, id, created, deferredUntil });
      } catch (err) {
        console.error('[INBOUND] hook persist failed:', err);
        return new Response('persist failed', { status: 500 });
      }
    }

    if (url.pathname === '/hooks/human-outbound' && req.method === 'POST') {
      const parsed = await readHookBody(req);
      if (!parsed.ok) return new Response(parsed.msg, { status: parsed.status });

      const body = parsed.body as { peer?: string; account?: string; channel?: string; ts?: string };
      if (!body.peer || !body.account) return new Response('missing peer/account', { status: 400 });

      try {
        await upsertHumanOutbound(
          body.peer,
          body.account,
          body.channel ?? 'whatsapp',
          body.ts ?? new Date().toISOString(),
        );
        console.log(`[INBOUND] human outbound peer=${body.peer} account=${body.account}`);
        return Response.json({ ok: true, takeoverUntil: new Date(Date.now() + TAKEOVER_MS).toISOString() });
      } catch (err) {
        console.error('[INBOUND] human outbound upsert failed:', err);
        return new Response('upsert failed', { status: 500 });
      }
    }

    return new Response('not found', { status: 404 });
  },
});

console.log(`[INBOUND] hook server listening on http://127.0.0.1:${server.port}`);

await (async () => {
  const { error } = await supabase
    .from('appointment_inbound_messages')
    .select('id', { head: true, count: 'exact' })
    .limit(1);
  if (error) {
    console.error(`[INBOUND] supabase readiness probe failed: ${error.message}`);
    if (underSystemd) process.exit(1);
  } else {
    sdReady('hook listening, supabase OK');
    console.log(`[INBOUND] ready (systemd=${underSystemd})`);
  }
})();

tick();
setInterval(tick, POLL_INTERVAL_MS);

const WATCHDOG_MS = parseInt(env.WATCHDOG_PING_MS ?? '15000', 10);
const STUCK_THRESHOLD_MS = Math.max(POLL_INTERVAL_MS * 10, 60_000);
setInterval(() => {
  const stuckMs = Date.now() - lastTickAt;
  if (stuckMs > STUCK_THRESHOLD_MS) {
    sdStatus(`UNHEALTHY lastTick=${stuckMs}ms ago`);
    return;
  }
  sdWatchdog();
}, WATCHDOG_MS);

function shutdown(signal: string): void {
  console.log(`[INBOUND] ${signal} received, stopping`);
  sdStopping(`stopping on ${signal}`);
  server.stop();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
