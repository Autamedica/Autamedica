/**
 * MediAgenda Reminder Worker
 *
 * Worker de larga duración que:
 * 1. Cada minuto revisa recordatorios pendientes
 * 2. Los envía vía OpenClaw (WhatsApp/Telegram)
 * 3. Expira ofertas de waitlist vencidas
 *
 * Configuración vía env vars:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - OPENCLAW_URL (default: http://127.0.0.1:18789)
 * - OPENCLAW_TOKEN
 * - OPENCLAW_ACCOUNT (default: autamedica)
 * - REMINDER_DRY_RUN (default: false)
 * - REMINDER_INTERVAL_MS (default: 60000)
 */

import { createClient } from '@supabase/supabase-js';
import { processReminderCycle, DEFAULT_OPENCLAW_CONFIG } from '@autamedica/scheduling';
import type { OpenClawConfig } from '@autamedica/scheduling';
import { getServerEnvOrDefault } from '@autamedica/shared';

// Config from env
const SUPABASE_URL = getServerEnvOrDefault('SUPABASE_URL');
const SUPABASE_KEY = getServerEnvOrDefault('SUPABASE_SERVICE_ROLE_KEY');
const OPENCLAW_URL = getServerEnvOrDefault('OPENCLAW_URL') ?? DEFAULT_OPENCLAW_CONFIG.baseUrl;
const OPENCLAW_TOKEN = getServerEnvOrDefault('OPENCLAW_TOKEN') ?? '';
const OPENCLAW_ACCOUNT = getServerEnvOrDefault('OPENCLAW_ACCOUNT') ?? 'autamedica';
const DRY_RUN = getServerEnvOrDefault('REMINDER_DRY_RUN') === 'true';
const INTERVAL_MS = parseInt(getServerEnvOrDefault('REMINDER_INTERVAL_MS') ?? '60000', 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!OPENCLAW_TOKEN && !DRY_RUN) {
  console.warn('⚠️  OPENCLAW_TOKEN not set. Running in DRY_RUN mode.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const openclawConfig: OpenClawConfig = {
  baseUrl: OPENCLAW_URL,
  token: OPENCLAW_TOKEN,
  defaultChannel: 'whatsapp',
  accountId: OPENCLAW_ACCOUNT,
};

const effectiveDryRun = DRY_RUN || !OPENCLAW_TOKEN;

console.log('🏥 MediAgenda Reminder Worker starting...');
console.log(`   Supabase: ${SUPABASE_URL}`);
console.log(`   OpenClaw: ${OPENCLAW_URL} (account: ${OPENCLAW_ACCOUNT})`);
console.log(`   Dry Run: ${effectiveDryRun}`);
console.log(`   Interval: ${INTERVAL_MS}ms`);
console.log('');

async function tick() {
  try {
    const result = await processReminderCycle(supabase, {
      openclaw: openclawConfig,
      batchSize: 50,
      dryRun: effectiveDryRun,
    });

    if (result.processed > 0) {
      console.log(
        `[${new Date().toISOString()}] Processed: ${result.processed} | Sent: ${result.sent} | Failed: ${result.failed} | Waitlist expired: ${result.waitlistExpired}`,
      );
    }

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(`  ❌ ${err}`);
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Worker error:`, err);
  }
}

// Initial run
tick();

// Periodic execution
setInterval(tick, INTERVAL_MS);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Worker stopping...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Worker stopping...');
  process.exit(0);
});
