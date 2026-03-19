import { getServerEnvOrDefault, logger } from '@autamedica/shared';
import { runPatientAiSyncCycle } from './patient-ai-analysis';

function parseIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(getServerEnvOrDefault(name, String(fallback)) ?? String(fallback), 10);
  return Number.isFinite(value) ? value : fallback;
}

const intervalMs = Math.max(parseIntegerEnv('PATIENT_AI_SYNC_INTERVAL_MS', 15 * 60 * 1000), 60_000);
const batchSize = Math.min(Math.max(parseIntegerEnv('PATIENT_AI_SYNC_BATCH_SIZE', 25), 1), 100);
const staleHours = Math.min(Math.max(parseIntegerEnv('PATIENT_AI_SYNC_STALE_HOURS', 24), 1), 24 * 30);
const failedRetryMinutes = Math.min(
  Math.max(parseIntegerEnv('PATIENT_AI_SYNC_FAILED_RETRY_MINUTES', 60), 5),
  24 * 60,
);
const dryRun = getServerEnvOrDefault('PATIENT_AI_SYNC_DRY_RUN', 'false') === 'true';

let running = false;

async function tick(): Promise<void> {
  if (running) {
    logger.warn('[PatientAiSyncWorker] Previous cycle still running; skipping tick');
    return;
  }

  running = true;

  try {
    const result = await runPatientAiSyncCycle({
      limit: batchSize,
      staleHours,
      failedRetryMinutes,
      dryRun,
    });

    logger.info('[PatientAiSyncWorker] Cycle completed', {
      processed: result.processed,
      generated: result.generated,
      failed: result.failed,
      skipped: result.skipped,
      providerConfigured: result.providerConfigured,
      dryRun: result.dryRun,
    });

    if (result.failed > 0) {
      logger.warn(
        '[PatientAiSyncWorker] Some patients could not be analyzed',
        result.results.filter((item) => item.action === 'failed'),
      );
    }
  } catch (error) {
    logger.error('[PatientAiSyncWorker] Cycle failed', error);
  } finally {
    running = false;
  }
}

logger.info('[PatientAiSyncWorker] Starting worker', {
  intervalMs,
  batchSize,
  staleHours,
  failedRetryMinutes,
  dryRun,
});

void tick();
setInterval(() => {
  void tick();
}, intervalMs);

process.on('SIGINT', () => {
  logger.info('[PatientAiSyncWorker] Stopping worker');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('[PatientAiSyncWorker] Stopping worker');
  process.exit(0);
});
