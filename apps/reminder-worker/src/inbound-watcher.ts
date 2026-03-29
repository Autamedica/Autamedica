/**
 * Inbound WhatsApp Watcher — Monitorea respuestas de pacientes vía OpenClaw.
 *
 * Escucha el log de WhatsApp del gateway y cuando detecta un mensaje inbound
 * al account autamedica, parsea la respuesta y hace POST al webhook del backend.
 *
 * Bypass completo del agente LLM — más confiable, sin tokens, sin latencia.
 *
 * Ejecutar junto al reminder worker:
 *   bun --watch apps/reminder-worker/src/inbound-watcher.ts
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureEnv } from '@autamedica/shared';

const execAsync = promisify(exec);

const env = globalThis.process?.env ?? {};
const BACKEND_WEBHOOK_URL = env.BACKEND_WEBHOOK_URL ?? 'http://localhost:3000/api/webhooks/openclaw';
const WEBHOOK_SECRET = ensureEnv('OPENCLAW_WEBHOOK_SECRET');
const POLL_INTERVAL_MS = parseInt(env.WATCHER_POLL_MS ?? '3000', 10);
const OPENCLAW_ACCOUNT = env.OPENCLAW_ACCOUNT ?? 'autamedica';

console.log('👂 Inbound WhatsApp Watcher starting...');
console.log(`   Backend: ${BACKEND_WEBHOOK_URL}`);
console.log(`   Account: ${OPENCLAW_ACCOUNT}`);
console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`);
console.log('');

const processedMessages = new Set<string>();

/**
 * Parsea respuesta del paciente.
 */
function parseResponse(message: string): 'confirmed' | 'cancelled' | 'accepted' | null {
  const normalized = message.trim().toLowerCase();
  if (['confirmo', 'si', 'sí', 'ok', 'confirmar', 'confirma'].includes(normalized)) return 'confirmed';
  if (['cancelo', 'cancelar', 'no', 'cancela'].includes(normalized)) return 'cancelled';
  if (['acepto', 'aceptar', 'quiero', 'dale'].includes(normalized)) return 'accepted';
  return null;
}

/**
 * Envía la respuesta del paciente al backend via webhook.
 */
async function forwardToBackend(from: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(BACKEND_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({ from, message, channel: 'whatsapp' }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`  ❌ Backend responded ${response.status}: ${text}`);
      return false;
    }

    const result = await response.json();
    console.log(`  ✅ Backend: action=${result.action ?? 'unknown'}`);
    return true;
  } catch (err) {
    console.error(`  ❌ Backend POST failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Chequea mensajes inbound recientes via journalctl.
 */
async function checkInbound(): Promise<void> {
  try {
    const { stdout } = await execAsync(
      `journalctl --user -u openclaw-gateway.service --since "10 sec ago" --no-pager 2>/dev/null | grep "Inbound message"`,
      { timeout: 5_000 },
    );

    if (!stdout.trim()) return;

    for (const line of stdout.trim().split('\n')) {
      // Parse: [whatsapp] Inbound message +5491171293450 -> +5491137842406 (direct, 61 chars)
      const match = line.match(/Inbound message (\+\d+) -> (\+\d+) \(direct, (\d+) chars\)/);
      if (!match) continue;

      const [, from, to] = match;
      const msgId = `${from}-${line.match(/\d{2}:\d{2}:\d{2}/)?.[0] ?? Date.now()}`;

      if (processedMessages.has(msgId)) continue;
      processedMessages.add(msgId);

      // Keep set bounded
      if (processedMessages.size > 1000) {
        const first = processedMessages.values().next().value;
        if (first) processedMessages.delete(first);
      }

      console.log(`[${new Date().toISOString()}] Inbound: ${from} -> ${to}`);

      // We need the actual message content — journalctl doesn't show it.
      // For now, we'll read the session file to get the last user message.
      await handleInboundFromSession(from);
    }
  } catch {
    // journalctl may return non-zero if no matches — that's fine
  }
}

/**
 * Lee el mensaje del paciente desde la sesión de OpenClaw.
 */
async function handleInboundFromSession(senderPhone: string): Promise<void> {
  try {
    // Find the most recent session file for this sender
    const { stdout } = await execAsync(
      `grep -l '"${senderPhone}"' ~/.openclaw/agents/autamedica/sessions/*.jsonl 2>/dev/null | head -1`,
      { timeout: 5_000 },
    );

    const sessionFile = stdout.trim();
    if (!sessionFile) {
      console.log(`  ⚠️ No session found for ${senderPhone}`);
      return;
    }

    // Get the last user message from the session
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
          // Extract just the actual message (after metadata blocks)
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

    console.log(`  📩 Message: "${messageText}"`);

    const action = parseResponse(messageText);
    if (!action) {
      console.log(`  ℹ️ Not a recognized response — skipping webhook`);
      return;
    }

    console.log(`  🔄 Forwarding to backend: ${action}`);
    await forwardToBackend(senderPhone, messageText);
  } catch (err) {
    console.error(`  ❌ Session read failed:`, err instanceof Error ? err.message : err);
  }
}

// Main loop
async function tick() {
  await checkInbound();
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
