// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@autamedica/types';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import {
  AUTAMEDICA_FROM,
  buildNurturingEmail,
  buildReminderEmail,
  buildWelcomeEmail,
  renderAutamedicaEmail,
  type RenderedEmail,
} from '@/lib/email/autamedica-template';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type RuntimeEnv = Record<string, unknown> | null | undefined;
type AdminClient = SupabaseClient<Database>;

type EmailJobType =
  | 'welcome'
  | 'anamnesis_reminder'
  | 'appointment_reminder'
  | 'newsletter'
  | 'doctor_new_appointment'
  | 'doctor_appointment_cancelled'
  | 'doctor_anamnesis_ready'
  | 'patient_appointment_cancelled'
  | 'patient_prescription_ready'
  | 'nurturing';

type EmailJob = {
  id: string;
  job_type: EmailJobType;
  recipient_email: string;
  recipient_name: string | null;
  template_data: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
};

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function readEnv(runtimeEnv: RuntimeEnv, key: string): string {
  const runtimeValue = runtimeEnv?.[key];
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) return runtimeValue;

  const importValue = import.meta.env[key];
  return typeof importValue === 'string' ? importValue : '';
}

function isAuthorized(request: Request, runtimeEnv: RuntimeEnv): boolean {
  const secret = readEnv(runtimeEnv, 'CRON_SECRET') || readEnv(runtimeEnv, 'TRIGGER_KEY');
  if (!secret) return false;

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const triggerKey = request.headers.get('x-trigger-key');
  return bearer === secret || triggerKey === secret;
}

function numberParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

function stringFromData(data: Record<string, unknown> | null, key: string): string {
  const value = data?.[key];
  return typeof value === 'string' ? value : '';
}

function firstName(job: EmailJob): string {
  return job.recipient_name || 'como estas';
}

function renderAppointmentReminder(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const appointmentTime = stringFromData(data, 'appointment_time');
  const actionUrl =
    stringFromData(data, 'action_url') || 'https://www.autamedica.com/patients/appointments';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica · recordatorio de consulta', {
    variant: 'reminder',
    title: `Hola, ${job.recipient_name || 'como estas'}`,
    preheader: 'Te dejamos los datos de tu proxima consulta en AutaMedica.',
    paragraphs: [
      appointmentTime
        ? `Tu consulta esta agendada para el ${appointmentTime} hs.`
        : 'Tenes una consulta agendada en AutaMedica.',
      'Te dejamos el acceso a tu agenda para revisar el horario y entrar a la videoconsulta cuando corresponda.',
    ],
    action: { label: 'Ver consulta', url: actionUrl },
    unsubscribeUrl,
  });
}

function renderDoctorNewAppointment(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const appointmentTime = stringFromData(data, 'appointment_time');
  const patientName = stringFromData(data, 'patient_name') || 'Un paciente';
  const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com/doctors/agenda';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica · nueva cita agendada', {
    variant: 'transactional',
    title: `Hola, ${firstName(job)}`,
    preheader: 'Tenes una nueva cita agendada en AutaMedica.',
    paragraphs: [
      appointmentTime
        ? `${patientName} agendo una consulta para el ${appointmentTime} hs.`
        : `${patientName} agendo una nueva consulta.`,
      'Ya podes verla desde tu agenda medica.',
    ],
    action: { label: 'Ver agenda', url: actionUrl },
    unsubscribeUrl,
  });
}

function renderDoctorAppointmentCancelled(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const appointmentTime = stringFromData(data, 'appointment_time');
  const patientName = stringFromData(data, 'patient_name') || 'Un paciente';
  const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com/doctors/agenda';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica · cita cancelada', {
    variant: 'transactional',
    title: `Hola, ${firstName(job)}`,
    preheader: 'Una cita fue cancelada en AutaMedica.',
    paragraphs: [
      appointmentTime
        ? `${patientName} cancelo la consulta del ${appointmentTime} hs.`
        : `${patientName} cancelo una consulta.`,
      'Tu agenda ya refleja el cambio.',
    ],
    action: { label: 'Ver agenda', url: actionUrl },
    unsubscribeUrl,
  });
}

function renderPatientAppointmentCancelled(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const appointmentTime = stringFromData(data, 'appointment_time');
  const doctorName = stringFromData(data, 'doctor_name') || 'Tu medico';
  const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com/patients/appointments';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica · cita cancelada', {
    variant: 'transactional',
    title: `Hola, ${firstName(job)}`,
    preheader: 'Tu cita fue cancelada en AutaMedica.',
    paragraphs: [
      appointmentTime
        ? `${doctorName} cancelo la consulta del ${appointmentTime} hs.`
        : `${doctorName} cancelo una consulta.`,
      'Podes revisar tus turnos y agendar uno nuevo desde tu portal.',
    ],
    action: { label: 'Ver turnos', url: actionUrl },
    unsubscribeUrl,
  });
}

function renderDoctorAnamnesisReady(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const patientName = stringFromData(data, 'patient_name') || 'Un paciente';
  const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com/doctors/patients';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica · anamnesis disponible', {
    variant: 'transactional',
    title: `Hola, ${firstName(job)}`,
    preheader: 'Hay una anamnesis lista para revisar.',
    paragraphs: [
      `${patientName} completo su anamnesis preconsulta.`,
      'Ya podes revisarla desde el panel medico.',
    ],
    action: { label: 'Ver paciente', url: actionUrl },
    unsubscribeUrl,
  });
}

function renderPatientPrescriptionReady(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const doctorName = stringFromData(data, 'doctor_name') || 'Tu medico';
  const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com/patients/prescriptions';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica · receta disponible', {
    variant: 'transactional',
    title: `Hola, ${firstName(job)}`,
    preheader: 'Tenes una receta disponible en AutaMedica.',
    paragraphs: [
      `${doctorName} dejo una receta disponible para vos.`,
      'Podes verla y descargarla desde tu portal.',
    ],
    action: { label: 'Ver receta', url: actionUrl },
    unsubscribeUrl,
  });
}

function renderJob(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  if (job.job_type === 'welcome') {
    return buildWelcomeEmail(firstName(job), actionUrl, unsubscribeUrl);
  }

  if (job.job_type === 'anamnesis_reminder') {
    return buildReminderEmail(firstName(job), actionUrl, unsubscribeUrl);
  }

  if (job.job_type === 'appointment_reminder') {
    return renderAppointmentReminder(job);
  }

  if (job.job_type === 'doctor_new_appointment') {
    return renderDoctorNewAppointment(job);
  }

  if (job.job_type === 'doctor_appointment_cancelled') {
    return renderDoctorAppointmentCancelled(job);
  }

  if (job.job_type === 'patient_appointment_cancelled') {
    return renderPatientAppointmentCancelled(job);
  }

  if (job.job_type === 'doctor_anamnesis_ready') {
    return renderDoctorAnamnesisReady(job);
  }

  if (job.job_type === 'patient_prescription_ready') {
    return renderPatientPrescriptionReady(job);
  }

  if (job.job_type === 'nurturing') {
    const data = job.template_data ?? {};
    const templateKey = stringFromData(data, 'template_key');
    const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com/patients/anamnesis';
    const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;
    return buildNurturingEmail(templateKey, firstName(job), actionUrl, unsubscribeUrl);
  }

  return renderAutamedicaEmail('AutaMedica', {
    variant: 'transactional',
    title: 'AutaMedica',
    paragraphs: ['Te compartimos una actualizacion de AutaMedica.'],
    action: { label: 'Abrir AutaMedica', url: actionUrl },
    unsubscribeUrl,
  });
}

async function sendViaResend(
  runtimeEnv: RuntimeEnv,
  job: EmailJob,
  email: RenderedEmail,
): Promise<string> {
  const apiKey = readEnv(runtimeEnv, 'RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: `${AUTAMEDICA_FROM.name} <${AUTAMEDICA_FROM.email}>`,
      to: [job.recipient_email],
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [
        { name: 'source', value: 'autamedica_email_jobs' },
        { name: 'job_type', value: job.job_type },
      ],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${body}`);
  }

  const parsed = JSON.parse(body) as { id?: string };
  return parsed.id ?? '';
}

async function enqueueDueReminders(admin: AdminClient, limit: number): Promise<number> {
  const { data, error } = await (admin as any)
    .schema('growth_os')
    .rpc('enqueue_anamnesis_reminders', { batch_limit: limit, min_profile_age: '2 hours' });

  if (error) {
    logger.error('[email-jobs] Failed to enqueue anamnesis reminders', { error });
    throw new Error(error.message);
  }

  return typeof data === 'number' ? data : 0;
}

async function loadPendingJobs(admin: AdminClient, limit: number): Promise<EmailJob[]> {
  const { data, error } = await (admin as any)
    .schema('growth_os')
    .from('email_jobs')
    .select('id, job_type, recipient_email, recipient_name, template_data, attempts, max_attempts')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as EmailJob[];
}

async function claimJob(admin: AdminClient, job: EmailJob): Promise<boolean> {
  const { data, error } = await (admin as any)
    .schema('growth_os')
    .from('email_jobs')
    .update({
      status: 'processing',
      attempts: job.attempts + 1,
      last_error: null,
      provider: 'resend',
    })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean((data as any)?.id);
}

async function markSent(admin: AdminClient, jobId: string, providerMessageId: string): Promise<void> {
  const { error } = await (admin as any)
    .schema('growth_os')
    .from('email_jobs')
    .update({
      status: 'sent',
      provider: 'resend',
      provider_message_id: providerMessageId || null,
      sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', jobId);

  if (error) throw new Error(error.message);
}

async function markFailed(admin: AdminClient, job: EmailJob, errorMessage: string): Promise<void> {
  const nextStatus = job.attempts + 1 >= job.max_attempts ? 'failed' : 'pending';
  const { error } = await (admin as any)
    .schema('growth_os')
    .from('email_jobs')
    .update({
      status: nextStatus,
      last_error: errorMessage.slice(0, 2000),
    })
    .eq('id', job.id);

  if (error) throw new Error(error.message);
}

async function handle(request: Request, runtimeEnv: RuntimeEnv, dryRunOverride?: boolean): Promise<Response> {
  if (!isAuthorized(request, runtimeEnv)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const limit = numberParam(url, 'limit', DEFAULT_LIMIT);
  const dryRun = dryRunOverride ?? url.searchParams.get('dry_run') === 'true';
  const admin = createAstroAdminClient(runtimeEnv);

  if (dryRun) {
    const jobs = await loadPendingJobs(admin, limit);
    return json({
      dry_run: true,
      pending: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.id,
        job_type: job.job_type,
        recipient_email: job.recipient_email,
        subject: renderJob(job).subject,
      })),
    });
  }

  const enqueued = await enqueueDueReminders(admin, limit);

  // Enqueue nurturing sequence emails
  let nurturingEnqueued = 0;
  try {
    const { data: nData } = await (admin as any)
      .schema('growth_os')
      .rpc('enqueue_nurturing_emails', { batch_limit: limit });
    nurturingEnqueued = typeof nData === 'number' ? nData : 0;
  } catch (nErr) {
    logger.error('[email-jobs] Failed to enqueue nurturing emails', { error: nErr });
  }
  const jobs = await loadPendingJobs(admin, limit);
  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    try {
      const claimed = await claimJob(admin, job);
      if (!claimed) continue;

      const rendered = renderJob(job);
      const providerMessageId = await sendViaResend(runtimeEnv, job, rendered);
      await markSent(admin, job.id, providerMessageId);
      results.push({ id: job.id, job_type: job.job_type, status: 'sent' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[email-jobs] Failed job', { jobId: job.id, jobType: job.job_type, message });
      await markFailed(admin, job, message);
      results.push({ id: job.id, job_type: job.job_type, status: 'error', error: message });
    }
  }

  return json({
    enqueued,
    nurturing_enqueued: nurturingEnqueued,
    processed: results.length,
    sent: results.filter((result) => result.status === 'sent').length,
    errors: results.filter((result) => result.status === 'error').length,
    results,
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  return handle(request, locals.runtime?.env);
};

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  return handle(request, locals.runtime?.env, url.searchParams.get('run') !== 'true');
};
