import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMessageWithFallback, type OpenClawConfig } from '@autamedica/scheduling';

type DoctorWhatsAppJob = {
  id: string;
  appointment_id: string;
  recipient_phone: string;
  message: string;
  attempts: number;
};

type ProcessDoctorWhatsAppOptions = {
  openclaw: OpenClawConfig;
  batchSize?: number;
  dryRun?: boolean;
};

type ProcessDoctorWhatsAppResult = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function processDoctorWhatsAppJobs(
  supabase: SupabaseClient,
  options: ProcessDoctorWhatsAppOptions,
): Promise<ProcessDoctorWhatsAppResult> {
  const result: ProcessDoctorWhatsAppResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const { data: jobs, error } = await supabase
    .schema('growth_os')
    .from('doctor_whatsapp_jobs')
    .select('id, appointment_id, recipient_phone, message, attempts')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(options.batchSize ?? 25);

  if (error) {
    result.errors.push(`doctor_whatsapp_jobs query failed: ${error.message}`);
    return result;
  }

  for (const job of (jobs ?? []) as DoctorWhatsAppJob[]) {
    result.processed += 1;

    const staleReason = await getStaleAppointmentReason(supabase, job.appointment_id);
    if (staleReason) {
      const { error: updateError } = await supabase
        .schema('growth_os')
        .from('doctor_whatsapp_jobs')
        .update({
          status: 'failed',
          attempts: job.attempts + 1,
          last_error: staleReason,
        })
        .eq('id', job.id);

      if (updateError) {
        result.errors.push(`doctor_whatsapp_jobs ${job.id} stale update failed: ${updateError.message}`);
      }

      result.skipped += 1;
      continue;
    }

    if (options.dryRun) {
      console.log(`[DOCTOR-WA DRYRUN] Would send to ${job.recipient_phone}:\n${job.message}`);
      result.sent += 1;
      continue;
    }

    const sent = await sendMessageWithFallback(options.openclaw, {
      to: job.recipient_phone,
      message: job.message,
      channel: 'whatsapp',
    });

    if (sent.ok) {
      const { error: updateError } = await supabase
        .schema('growth_os')
        .from('doctor_whatsapp_jobs')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          attempts: job.attempts + 1,
          last_error: null,
        })
        .eq('id', job.id);

      if (updateError) {
        result.errors.push(`doctor_whatsapp_jobs ${job.id} sent but update failed: ${updateError.message}`);
      }

      result.sent += 1;
      continue;
    }

    const nextAttempts = job.attempts + 1;
    const terminal = nextAttempts >= 3;
    const { error: updateError } = await supabase
      .schema('growth_os')
      .from('doctor_whatsapp_jobs')
      .update({
        status: terminal ? 'failed' : 'pending',
        attempts: nextAttempts,
        scheduled_for: new Date(Date.now() + nextAttempts * 60_000).toISOString(),
        last_error: sent.error ?? sent.raw ?? 'OpenClaw send failed',
      })
      .eq('id', job.id);

    if (updateError) {
      result.errors.push(`doctor_whatsapp_jobs ${job.id} failure update failed: ${updateError.message}`);
    }

    result.failed += 1;
  }

  return result;
}

async function getStaleAppointmentReason(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_time, status')
    .eq('id', appointmentId)
    .single();

  if (error || !data) {
    return `Skipped doctor WhatsApp: appointment ${appointmentId} not found`;
  }

  const appointment = data as { start_time: string | null; status: string | null };
  if (appointment.status && ['cancelled', 'completed', 'no_show'].includes(appointment.status)) {
    return `Skipped doctor WhatsApp: appointment status is ${appointment.status}`;
  }

  if (!appointment.start_time) {
    return `Skipped doctor WhatsApp: appointment ${appointmentId} has no start_time`;
  }

  const startTime = new Date(appointment.start_time);
  if (Number.isNaN(startTime.getTime())) {
    return `Skipped doctor WhatsApp: invalid appointment start_time ${appointment.start_time}`;
  }

  if (startTime.getTime() <= Date.now()) {
    return `Skipped doctor WhatsApp: appointment started at ${appointment.start_time}`;
  }

  return null;
}
