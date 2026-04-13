import { buildWaitlistOffer, sendMessageWithFallback, type OpenClawConfig } from './openclaw';
import type { SupabaseLike } from './supabase';

export interface WaitlistDispatchResult {
  processed: number;
  sent: number;
  errors: string[];
}

interface DispatchConfig {
  openclaw: OpenClawConfig;
  batchSize?: number;
  dryRun?: boolean;
}

function formatExpiryWindow(expiresAt: string | null): string {
  if (!expiresAt) return 'unas horas';

  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'muy poco tiempo';

  const totalMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (totalMinutes < 60) return `${totalMinutes} minutos`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} horas` : `${hours}h ${minutes}m`;
}

export async function processUnsentWaitlistOffers(
  supabase: SupabaseLike,
  config: DispatchConfig,
): Promise<WaitlistDispatchResult> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('appointment_waitlist')
    .select(`
      id,
      offer_sent_at,
      offered_at,
      offered_start_time,
      offered_end_time,
      expires_at,
      patients!inner(id, user_id, profiles!inner(first_name, phone)),
      doctors!inner(id, user_id, profiles!inner(first_name, last_name))
    `)
    .eq('status', 'offered')
    .is('offer_sent_at', null)
    .gt('expires_at', now)
    .order('offered_at', { ascending: true })
    .limit(config.batchSize ?? 25);

  if (error) {
    throw new Error(`Error fetching unsent waitlist offers: ${error.message}`);
  }

  const result: WaitlistDispatchResult = {
    processed: data?.length ?? 0,
    sent: 0,
    errors: [],
  };

  for (const rawOffer of data ?? []) {
    const offer = rawOffer as Record<string, unknown>;
    const patient = offer.patients as Record<string, unknown> | null;
    const doctor = offer.doctors as Record<string, unknown> | null;
    const patientProfile = patient?.profiles as Record<string, string | null> | null;
    const doctorProfile = doctor?.profiles as Record<string, string | null> | null;
    const phone = patientProfile?.phone;
    const offeredStartTime = offer.offered_start_time as string | null;

    if (!phone) {
      result.errors.push(`Offer ${offer.id as string}: patient phone missing`);
      continue;
    }

    if (!offeredStartTime) {
      result.errors.push(`Offer ${offer.id as string}: offered_start_time missing`);
      continue;
    }

    const startsAt = new Date(offeredStartTime);
    const message = buildWaitlistOffer({
      patientName: patientProfile?.first_name ?? 'Paciente',
      doctorName: [doctorProfile?.first_name, doctorProfile?.last_name].filter(Boolean).join(' ') || 'Doctor',
      date: startsAt.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      time: startsAt.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      expiresIn: formatExpiryWindow(offer.expires_at as string | null),
    });

    if (config.dryRun) {
      await supabase
        .from('appointment_waitlist')
        .update({ offer_sent_at: new Date().toISOString() })
        .eq('id', offer.id as string);
      result.sent++;
      continue;
    }

    const sendResult = await sendMessageWithFallback(config.openclaw, {
      to: phone,
      message,
      channel: 'whatsapp',
    });

    if (!sendResult.ok) {
      result.errors.push(`Offer ${offer.id as string}: ${sendResult.error ?? 'unknown send error'}`);
      continue;
    }

    await supabase
      .from('appointment_waitlist')
      .update({ offer_sent_at: new Date().toISOString() })
      .eq('id', offer.id as string);

    result.sent++;
  }

  return result;
}
