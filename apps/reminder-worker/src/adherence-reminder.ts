/**
 * Adherence reminder loop — dispara recordatorios WhatsApp para tomas pendientes.
 *
 * Ciclo:
 *  1. Busca intake events en la ventana (now → now + horizon min) sin recordatorio enviado.
 *  2. Por cada uno, invoca `openclaw message send` al paciente.
 *  3. Marca reminder_sent_at + message_id.
 *
 * La confirmación la toma el inbound-watcher cuando el paciente responde "SI/TOME/NO".
 */

import { createClient } from '@supabase/supabase-js';
import { SupabaseAdherenceRepository } from '@autamedica/prescriptions';
import { ensureEnv } from '@autamedica/shared';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

const env = globalThis.process?.env ?? {};
const SUPABASE_URL = ensureEnv('SUPABASE_URL');
const SUPABASE_KEY = ensureEnv('SUPABASE_SERVICE_ROLE_KEY');
const HORIZON_MINUTES = parseInt(env.ADHERENCE_HORIZON_MIN ?? '10', 10);
const BATCH_SIZE = parseInt(env.ADHERENCE_BATCH ?? '30', 10);
const LOOP_INTERVAL_MS = parseInt(env.ADHERENCE_LOOP_MS ?? '60000', 10);
const OPENCLAW_ACCOUNT = env.OPENCLAW_ACCOUNT ?? 'autamedica';
const OPENCLAW_BIN = env.OPENCLAW_BIN ?? 'openclaw';
const DRY_RUN = env.ADHERENCE_DRY_RUN === 'true';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const repo = new SupabaseAdherenceRepository(supabase);

interface ScheduleLookupRow {
  drug_name: string;
  dosage: string;
  patients?: { phone: string | null } | Array<{ phone: string | null }> | null;
}

function formatTime(iso: string, tz = 'America/Argentina/Buenos_Aires'): string {
  return new Date(iso).toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}

async function lookupSchedule(scheduleId: string): Promise<{ drug_name: string; dosage: string; patient_phone: string | null } | null> {
  const { data } = await supabase
    .from('medication_schedules')
    .select('drug_name, dosage, patients(phone)')
    .eq('id', scheduleId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as ScheduleLookupRow;
  const patient = row.patients;
  return {
    drug_name: row.drug_name,
    dosage: row.dosage,
    patient_phone: Array.isArray(patient) ? patient[0]?.phone ?? null : patient?.phone ?? null,
  };
}

async function sendWhatsApp(phone: string, message: string): Promise<string> {
  if (DRY_RUN) {
    console.log(`[ADHERENCE] DRY_RUN to=${phone} msg="${message}"`);
    return `dry-${Date.now()}`;
  }

  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(OPENCLAW_BIN, [
      'message', 'send',
      '--channel', 'whatsapp',
      '--account', OPENCLAW_ACCOUNT,
      '--to', phone,
      message,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`openclaw send exit=${code}: ${stderr}`));
      const match = stdout.match(/message_id[:\s=]+([\w\-.]+)/i);
      resolve(match?.[1] ?? `sent-${Date.now()}`);
    });
  });
}

async function tick(): Promise<void> {
  try {
    const pending = await repo.listPendingReminders(HORIZON_MINUTES, BATCH_SIZE);
    if (pending.length === 0) return;

    console.log(`[ADHERENCE] processing ${pending.length} pending reminders`);

    for (const event of pending) {
      try {
        const ctx = await lookupSchedule(event.scheduleId);
        if (!ctx || !ctx.patient_phone) {
          console.warn(`[ADHERENCE] skip event=${event.id}: no schedule/phone`);
          continue;
        }

        const when = formatTime(event.expectedAt);
        const msg = `Recordatorio AutaMedica: tomá ${ctx.drug_name} ${ctx.dosage} a las ${when}.\nRespondé "SI" cuando lo hagas, o "NO" si preferís saltearlo.`;

        const messageId = await sendWhatsApp(ctx.patient_phone, msg);
        await repo.markReminderSent(event.id, messageId);
        console.log(`[ADHERENCE] sent event=${event.id} to=${ctx.patient_phone} mid=${messageId}`);
      } catch (err) {
        console.error(`[ADHERENCE] failed event=${event.id}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[ADHERENCE] tick error:', err);
  }
}

console.log(`[ADHERENCE] reminder starting horizon=${HORIZON_MINUTES}min batch=${BATCH_SIZE} loop=${LOOP_INTERVAL_MS}ms dryRun=${DRY_RUN}`);
tick();
setInterval(tick, LOOP_INTERVAL_MS);

function shutdown(sig: string): void {
  console.log(`[ADHERENCE] ${sig} received, stopping`);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
