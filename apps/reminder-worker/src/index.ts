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
import { processDoctorWhatsAppJobs } from './doctor-whatsapp-notifications';
import { processClinicalOutboxJobs } from './clinical-safety-outbox';
import { processPushNotificationJobs } from './push-notification-queue';

// Config from env
const SUPABASE_URL = getServerEnvOrDefault('SUPABASE_URL');
const SUPABASE_KEY = getServerEnvOrDefault('SUPABASE_SERVICE_ROLE_KEY');
const OPENCLAW_URL = getServerEnvOrDefault('OPENCLAW_URL') ?? DEFAULT_OPENCLAW_CONFIG.baseUrl;
const OPENCLAW_TOKEN = getServerEnvOrDefault('OPENCLAW_TOKEN') ?? '';
const OPENCLAW_ACCOUNT = getServerEnvOrDefault('OPENCLAW_ACCOUNT') ?? 'autamedica';
const DRY_RUN = getServerEnvOrDefault('REMINDER_DRY_RUN') === 'true';
const INTERVAL_MS = parseInt(getServerEnvOrDefault('REMINDER_INTERVAL_MS') ?? '60000', 10);
const RUN_ONCE = getServerEnvOrDefault('REMINDER_RUN_ONCE') === 'true' || process.argv.includes('--once');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!OPENCLAW_TOKEN && !DRY_RUN) {
  console.warn('⚠️  OPENCLAW_TOKEN not set. Continuing with OpenClaw CLI delivery.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const openclawConfig: OpenClawConfig = {
  baseUrl: OPENCLAW_URL,
  token: OPENCLAW_TOKEN,
  defaultChannel: 'whatsapp',
  accountId: OPENCLAW_ACCOUNT,
};

const effectiveDryRun = DRY_RUN;

console.log('🏥 MediAgenda Reminder Worker starting...');
console.log(`   Supabase: ${SUPABASE_URL}`);
console.log(`   OpenClaw: ${OPENCLAW_URL} (account: ${OPENCLAW_ACCOUNT})`);
console.log(`   Dry Run: ${effectiveDryRun}`);
console.log(`   Interval: ${INTERVAL_MS}ms`);
console.log(`   Run once: ${RUN_ONCE}`);
console.log('');

async function tick() {
  try {
    const result = await processReminderCycle(supabase, {
      openclaw: openclawConfig,
      batchSize: 50,
      dryRun: effectiveDryRun,
    });
    const doctorWhatsAppResult = await processDoctorWhatsAppJobs(supabase, {
      openclaw: openclawConfig,
      batchSize: 25,
      dryRun: effectiveDryRun,
    });
    const clinicalOutboxResult = await processClinicalOutboxJobs(supabase, {
      batchSize: 25,
      dryRun: effectiveDryRun,
    });
    const pushQueueResult = await processPushNotificationJobs(supabase, {
      batchSize: 50,
      dryRun: effectiveDryRun,
    });

    if (
      result.processed > 0 ||
      result.waitlistOffersSent > 0 ||
      result.waitlistExpired > 0 ||
      result.noShowsMarked > 0 ||
      doctorWhatsAppResult.processed > 0 ||
      clinicalOutboxResult.processed > 0 ||
      pushQueueResult.processed > 0
    ) {
      console.log(
        `[${new Date().toISOString()}] Processed: ${result.processed} | Sent: ${result.sent} | Skipped: ${result.skipped} | Failed: ${result.failed} | Waitlist sent: ${result.waitlistOffersSent} | Waitlist expired: ${result.waitlistExpired} | No-show marked: ${result.noShowsMarked} | Doctor WA sent: ${doctorWhatsAppResult.sent} | Doctor WA skipped: ${doctorWhatsAppResult.skipped} | Doctor WA failed: ${doctorWhatsAppResult.failed} | Clinical Outbox processed: ${clinicalOutboxResult.processed} | Dispatched: ${clinicalOutboxResult.dispatched} | Skipped: ${clinicalOutboxResult.skipped} | Push Queue processed: ${pushQueueResult.processed} | Dispatched: ${pushQueueResult.dispatched} | Failed: ${pushQueueResult.failed} | Skipped: ${pushQueueResult.skipped}`,
      );
    }

    const errors = [...result.errors, ...doctorWhatsAppResult.errors, ...clinicalOutboxResult.errors, ...pushQueueResult.errors];
    if (errors.length > 0) {
      for (const err of errors) {
        console.error(`  ❌ ${err}`);
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Worker error:`, err);
  }
}

// Initial run
await tick();

if (RUN_ONCE) {
  process.exit(0);
}

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
