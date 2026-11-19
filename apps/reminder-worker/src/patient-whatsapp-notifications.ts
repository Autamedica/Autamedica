import type { SupabaseClient } from "@supabase/supabase-js";

type PatientWhatsAppJob = {
  id: string;
  recipient_phone: string;
  message: string;
  attempts: number;
};

type Options = {
  relayUrl: string;
  apiKey: string;
  batchSize?: number;
  dryRun?: boolean;
};

export type PatientWhatsAppResult = {
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
};

export async function processPatientWhatsAppJobs(
  supabase: SupabaseClient,
  options: Options,
): Promise<PatientWhatsAppResult> {
  const result: PatientWhatsAppResult = { processed: 0, sent: 0, failed: 0, errors: [] };
  const batchSize = options.batchSize ?? 25;

  // Dry runs are read-only. Real runs use the database's SKIP LOCKED claim RPC.
  const claimed = options.dryRun
    ? await supabase.schema("growth_os")
        .from("patient_whatsapp_jobs")
        .select("id, recipient_phone, message, attempts")
        .eq("status", "pending")
        .lte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(batchSize)
    : await supabase.schema("growth_os").rpc("claim_patient_whatsapp_jobs", {
        p_limit: batchSize,
      });

  if (claimed.error) {
    result.errors.push(`patient_whatsapp_jobs claim failed: ${claimed.error.message}`);
    return result;
  }

  const jobs = (claimed.data ?? []) as PatientWhatsAppJob[];
  result.processed = jobs.length;

  for (const job of jobs) {
    if (options.dryRun) {
      console.log(`[PATIENT-WA DRYRUN] Would send job ${job.id} to ${job.recipient_phone}`);
      continue;
    }

    try {
      const response = await fetch(`${options.relayUrl.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": options.apiKey },
        body: JSON.stringify({
          event: "prescription.issued",
          channel: "whatsapp",
          accountId: "autamedica",
          idempotencyKey: job.id,
          to: job.recipient_phone,
          message: job.message,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        messageId?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `relay_http_${response.status}`);
      }

      const { error: updateError } = await supabase
        .schema("growth_os")
        .from("patient_whatsapp_jobs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: payload.messageId ?? null,
          last_error: null,
        })
        .eq("id", job.id)
        .eq("status", "processing");
      if (updateError) throw updateError;
      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "WhatsApp send failed";
      const retryAt = new Date(Date.now() + Math.min(2 ** job.attempts, 30) * 60_000).toISOString();
      const { error: updateError } = await supabase
        .schema("growth_os")
        .from("patient_whatsapp_jobs")
        .update({
          status: job.attempts >= 5 ? "failed" : "pending",
          scheduled_for: retryAt,
          last_error: message.slice(0, 2000),
        })
        .eq("id", job.id)
        .eq("status", "processing");
      if (updateError) {
        result.errors.push(`patient_whatsapp_jobs ${job.id} update failed: ${updateError.message}`);
      }
      result.errors.push(`patient_whatsapp_jobs ${job.id}: ${message}`);
      result.failed += 1;
    }
  }

  return result;
}
