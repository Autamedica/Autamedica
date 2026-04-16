import type { SupabaseLike } from './supabase';
import { logger } from '@autamedica/shared';
import { sendMessageWithFallback, type OpenClawConfig } from './openclaw';

export interface ViralLoopConfig {
  openclaw: OpenClawConfig;
  dryRun?: boolean;
}

/**
 * Motor Viral / Referral Engine (Loop Viral del Paciente Satisfecho)
 * Ejecuta el follow-up por WhatsApp 1 hora después de consultas exitosas.
 */
export async function processViralLoopReferrals(
  supabase: SupabaseLike,
  config: ViralLoopConfig
): Promise<{ sent: number; errors: string[] }> {
  let sent = 0;
  const errors: string[] = [];

  try {
    // 1 hora después de la cita (se usa end_time como referencia)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Límite de seguridad para no procesar citas muy antiguas si el worker falló antes
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    const { data: appts, error: fetchErr } = await supabase
      .from('appointments')
      .select('id, end_time, patients!inner(id, profiles!inner(first_name, last_name, phone)), doctors!inner(profiles!inner(first_name, last_name))')
      .eq('status', 'completed')
      .is('referral_sent', false)
      .lte('end_time', oneHourAgo)
      .gte('end_time', threeHoursAgo)
      .limit(50);

    if (fetchErr) throw new Error(`Error fetching candidates: ${fetchErr.message}`);
    if (!appts || appts.length === 0) return { sent: 0, errors: [] };

    for (const appt of appts as any[]) {
      const patientProfile = appt.patients?.profiles;
      const doctorProfile = appt.doctors?.profiles;
      
      if (!patientProfile?.phone) {
        errors.push(`Paciente ${appt.patients?.id} sin teléfono`);
        continue;
      }

      const patientName = patientProfile.first_name?.split(' ')[0] || 'Paciente';
      const doctorName = [doctorProfile?.first_name, doctorProfile?.last_name].filter(Boolean).join(' ') || 'Médico';
      const utmLink = `https://www.autamedica.com/triage?utm_source=whatsapp_referral&utm_campaign=viral_loop_${appt.id}`;

      const message = `Hola ${patientName}, ¿qué tal te pareció tu consulta con el Dr. ${doctorName}? 🩺

Si te ayudamos a mejorar tu salud hoy, regálale a un familiar su primera consulta de Triaje IA gratis compartiendo este link seguro:
${utmLink}`;

      if (!config.dryRun) {
        const sendResult = await sendMessageWithFallback(config.openclaw, {
          to: patientProfile.phone,
          message,
          channel: 'whatsapp'
        });

        if (sendResult.ok) {
          await supabase.from('appointments').update({ referral_sent: true }).eq('id', appt.id);
          sent++;
          logger.info(`[ViralLoop] Referral sent to ${patientProfile.phone} for appointment ${appt.id}`);
        } else {
          errors.push(`Falló OpenClaw para ${appt.id}: ${sendResult.error}`);
        }
      } else {
        logger.info(`[ViralLoop DRYRUN] Would send referral to ${patientProfile.phone}`);
        await supabase.from('appointments').update({ referral_sent: true }).eq('id', appt.id);
        sent++;
      }
    }
  } catch (err: any) {
    logger.error('[ViralLoop] processViralLoopReferrals error', err);
    errors.push(err.message || 'Unknown error');
  }

  return { sent, errors };
}
