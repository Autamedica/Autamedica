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
  const { data, error } = await supabase
    .schema("growth_os")
    .from("patient_whatsapp_jobs")
    .select("id, recipient_phone, message, attempts")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(options.batchSize ?? 25);

  if (error) {
    result.errors.push(`patient_whatsapp_jobs query failed: ${error.message}`);
    return result;
  }

  for (const job of (data ?? []) as PatientWhatsAppJob[]) {
    result.processed += 1;
    if (options.dryRun) {
      console.log(`[PATIENT-WA DRYRUN] Would send job ${job.id} to ${job.recipient_phone}`);
      result.sent += 1;
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
      if (!response.ok || !payload.ok)
        throw new Error(payload.error ?? `relay_http_${response.status}`);

      const { error: updateError } = await supabase
        .schema("growth_os")
        .from("patient_whatsapp_jobs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: job.attempts + 1,
          provider_message_id: payload.messageId ?? null,
          last_error: null,
        })
        .eq("id", job.id)
        .eq("status", "pending");
      if (updateError) throw updateError;
      result.sent += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message : "WhatsApp send failed";
      const { error: updateError } = await supabase
        .schema("growth_os")
        .from("patient_whatsapp_jobs")
        .update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          scheduled_for: new Date(Date.now() + Math.min(2 ** attempts, 30) * 60_000).toISOString(),
          last_error: message,
        })
        .eq("id", job.id)
        .eq("status", "pending");
      if (updateError)
        result.errors.push(`patient_whatsapp_jobs ${job.id} update failed: ${updateError.message}`);
      result.errors.push(`patient_whatsapp_jobs ${job.id}: ${message}`);
      result.failed += 1;
    }
  }

  return result;
}
