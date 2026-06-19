import { createClient } from "@supabase/supabase-js";
import { getServerEnvOrDefault } from "@autamedica/shared";
import { processPatientWhatsAppJobs } from "./patient-whatsapp-notifications";

const supabaseUrl = getServerEnvOrDefault("SUPABASE_URL");
const serviceRoleKey = getServerEnvOrDefault("SUPABASE_SERVICE_ROLE_KEY");
const relayUrl = getServerEnvOrDefault("OPENCLAW_EVENT_RELAY_URL") ?? "http://127.0.0.1:18791";
const apiKey = getServerEnvOrDefault("OPENCLAW_EVENT_RELAY_API_KEY");
const relayApiKey = apiKey ?? "";
const intervalMs = Number(getServerEnvOrDefault("PATIENT_WHATSAPP_INTERVAL_MS") ?? "30000");
const dryRun = getServerEnvOrDefault("PATIENT_WHATSAPP_DRY_RUN") === "true";
const runOnce =
  getServerEnvOrDefault("PATIENT_WHATSAPP_RUN_ONCE") === "true" || process.argv.includes("--once");

if (!supabaseUrl || !serviceRoleKey || !relayApiKey) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or OPENCLAW_EVENT_RELAY_API_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let running = false;
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await processPatientWhatsAppJobs(supabase, {
      relayUrl,
      apiKey: relayApiKey,
      batchSize: 25,
      dryRun,
    });
    if (result.processed > 0 || result.errors.length > 0) {
      console.log(
        `[${new Date().toISOString()}] Patient WA processed=${result.processed} sent=${result.sent} failed=${result.failed}`,
      );
      for (const error of result.errors) console.error(error);
    }
  } catch (error) {
    console.error("Patient WhatsApp worker cycle failed", error);
  } finally {
    running = false;
  }
}

await tick();
if (runOnce) process.exit(0);
setInterval(tick, intervalMs);
