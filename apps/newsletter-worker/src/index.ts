import { XMLParser } from "fast-xml-parser";
import { composeWelcomeEmail } from "./welcome-email";

export interface Env {
  GEMINI_API_KEY: string;
  RESEND_API_KEY: string;
  RESEND_AUDIENCE_ID: string;
  BREVO_API_KEY: string;
  BREVO_DEFAULT_TEMPLATE_ID?: string;
  BREVO_LIST_IDS?: string;
  BREVO_NEWSLETTER_RECIPIENTS?: string;
  TRIGGER_KEY: string;
  FROM_EMAIL: string;
  FROM_NAME: string;
  SUBJECT_PREFIX: string;
  RSS_FEEDS: string;
  TIMEZONE_LABEL: string;
  HEADER_IMAGE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AUTAMEDICA_EMAIL_JOBS_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  WORKER_PUBLIC_URL?: string;
}

const KILLSWITCH_CHANNEL = "email_resend";
const MAX_ITEMS_PER_FEED = 6;
const MAX_ITEMS_TO_SUMMARIZE = 2;
const MAX_CANDIDATES = 10;
const AI_MODEL = "gemini-2.5-flash";
const ARTICLE_FETCH_TIMEOUT_MS = 8000;
const MAX_ARTICLE_CHARS = 4000;
const AUTAMEDICA_BRAND_GIF_URL =
  "https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/public/public_assets/autamedica-reference-style.gif";
const AUTAMEDICA_BREVO_DEFAULT_TEMPLATE_ID = 8;

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

interface Summary {
  headline: string;
  body: string;
  link: string;
  source: string;
  originalTitle?: string;
}

type GeminiSummaryResponse = {
  skip?: boolean;
  headline?: string;
  body?: string;
};

type PublishLogEntry = {
  channel: string;
  platform?: string;
  external_id?: string;
  url?: string;
  title?: string;
  status?: string;
  error_message?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

interface NewsletterBuild {
  subject: string;
  html: string;
  candidates: NewsItem[];
  summaries: Summary[];
  editionDate: string;
}

interface NewsletterEdition {
  id: string;
  edition_date: string;
  subject: string;
  status: "draft" | "approved" | "sending" | "sent" | "failed" | "skipped";
  html: string;
  candidates: NewsItem[] | null;
  summaries: Summary[] | null;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at?: string;
  updated_at?: string;
}

interface SendResult {
  provider: "resend" | "brevo_campaign" | "brevo_smtp";
  id: string;
  count?: number;
}

interface EmailJob {
  id: string;
  job_type: 
    | "welcome" 
    | "anamnesis_reminder" 
    | "appointment_reminder" 
    | "newsletter"
    | "doctor_new_appointment"
    | "doctor_appointment_cancelled"
    | "doctor_anamnesis_ready"
    | "patient_appointment_cancelled"
    | "patient_prescription_ready"
    | "patient_medical_order_ready"
    | "nurturing"
    | "community_new_topic"
    | "community_new_comment";
  recipient_email: string;
  recipient_name: string | null;
  template_data: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
}

interface NewsletterProfile {
  user_id?: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  newsletter_subscribed: boolean | null;
}

interface ResendContact {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  unsubscribed?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processEmailJobs(env));

    if (controller.cron === "10 11 * * *") {
      ctx.waitUntil(createNewsletterDraft(env));
    }
  },

  async fetch(req: Request, env: Env) {
    try {
      return await handleFetch(req, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("worker fetch error", message);
      return jsonResponse({ status: "error", error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleFetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/run") {
      const unauthorized = requireAuth(req, env);
      if (unauthorized) return unauthorized;
      await processEmailJobs(env);
      const edition = await createNewsletterDraft(env);
      return jsonResponse({ status: "draft_created", edition });
    }
    if (url.pathname === "/jobs") {
      const unauthorized = requireAuth(req, env);
      if (unauthorized) return unauthorized;
      const result = await processEmailJobs(env);
      return jsonResponse(result);
    }
    if (url.pathname === "/preview") {
      const edition = await safeLoadNewsletterEdition(env, url.searchParams.get("id"));
      const html = edition?.html ?? (await buildNewsletter(env)).html;
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/newsletter/draft") {
      const unauthorized = requireAuth(req, env);
      if (unauthorized) return unauthorized;
      const edition = await createNewsletterDraft(env);
      return jsonResponse({ status: "draft_created", edition });
    }
    if (url.pathname === "/newsletter/latest") {
      const unauthorized = requireAuth(req, env);
      if (unauthorized) return unauthorized;
      const edition = await loadNewsletterEdition(env, url.searchParams.get("id"));
      return jsonResponse({ edition });
    }
    if (url.pathname === "/newsletter/approve") {
      const unauthorized = requireAuth(req, env);
      if (unauthorized) return unauthorized;
      const edition = await approveNewsletterEdition(env, url.searchParams.get("id"));
      // Trigger send automatically after approval if requested via this endpoint
      const sentEdition = await sendNewsletterEdition(env, edition.id);
      return jsonResponse({ status: "approved_and_sent", edition: sentEdition });
    }
    if (url.pathname === "/newsletter/send") {
      const unauthorized = requireAuth(req, env);
      if (unauthorized) return unauthorized;
      const edition = await sendNewsletterEdition(env, url.searchParams.get("id"));
      return jsonResponse({ status: "sent", edition });
    }
    return new Response("autamedica-newsletter worker", { status: 200 });
}

export async function processEmailJobs(env: Env) {
  // 1. Centralized Growth OS Logic: Trigger Astro App if URL is defined
  if (env.AUTAMEDICA_EMAIL_JOBS_URL) {
    try {
      const res = await fetch(env.AUTAMEDICA_EMAIL_JOBS_URL, {
        headers: { 
          "x-trigger-key": env.TRIGGER_KEY,
          "Authorization": `Bearer ${env.TRIGGER_KEY}`
        },
      });
      if (res.ok) {
        const result = await res.json() as Record<string, unknown>;
        console.log("Centralized Growth OS processing successful", result);
        return result;
      }
      console.error("Centralized Growth OS processing failed", res.status, await res.text());
    } catch (error) {
      console.error("Centralized Growth OS processing error", error);
    }
  }

  // 2. Fallback: Legacy local processing for basic transactional jobs
  const limit = 20;
  const enqueued = await enqueueAnamnesisReminders(env, limit);
  const jobs = await loadPendingEmailJobs(env, limit);
  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    try {
      const claimed = await claimEmailJob(env, job);
      if (!claimed) continue;

      if (env.BREVO_API_KEY) {
        const params = getBrevoParamsForJob(job);
        const providerMessageId = await sendTransactionalViaBrevo(env, job, params.subject, params);
        await markEmailJobSent(env, job.id, providerMessageId, "brevo");
        results.push({ id: job.id, job_type: job.job_type, status: "sent" });
      } else {
        const rendered = renderEmailJob(job);
        const providerMessageId = await sendTransactionalViaResend(env, job, rendered);
        await markEmailJobSent(env, job.id, providerMessageId, "resend");
        results.push({ id: job.id, job_type: job.job_type, status: "sent" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("processEmailJobs job error", job.id, message);
      try {
        const permanent = message.includes("Invalid `to` field") || message.includes("invalid recipient email");
        await markEmailJobFailed(env, permanent ? { ...job, max_attempts: job.attempts + 1 } : job, message);
      } catch (markError) {
        console.error("markEmailJobFailed fatal", job.id, markError);
      }
      results.push({ id: job.id, job_type: job.job_type, status: "error", error: message });
    }
  }

  return {
    enqueued,
    processed: results.length,
    sent: results.filter((result) => result.status === "sent").length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  };
}

export async function runNewsletter(env: Env) {
  const edition = await createNewsletterDraft(env);
  return sendNewsletterEdition(env, edition.id);
}

function requireAuth(req: Request, env: Env): Response | null {
  const url = new URL(req.url);
  const provided = req.headers.get("x-trigger-key") || url.searchParams.get("key");
  if (!env.TRIGGER_KEY || provided !== env.TRIGGER_KEY) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function supabaseHeaders(env: Env, schema = "growth_os"): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    "accept-profile": schema,
    "content-profile": schema,
  };
}

async function enqueueAnamnesisReminders(env: Env, limit: number): Promise<number> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/enqueue_anamnesis_reminders`, {
    method: "POST",
    headers: supabaseHeaders(env),
    body: JSON.stringify({ batch_limit: limit, min_profile_age: "2 hours" }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`enqueue_anamnesis_reminders ${res.status}: ${body}`);
  const parsed = JSON.parse(body);
  return typeof parsed === "number" ? parsed : 0;
}

async function loadPendingEmailJobs(env: Env, limit: number): Promise<EmailJob[]> {
  const due = encodeURIComponent(new Date().toISOString());
  const select = "id,job_type,recipient_email,recipient_name,template_data,attempts,max_attempts";
  const url = `${env.SUPABASE_URL}/rest/v1/email_jobs?status=eq.pending&scheduled_for=lte.${due}&select=${select}&order=scheduled_for.asc&limit=${limit}`;
  const res = await fetch(url, { headers: supabaseHeaders(env) });
  const body = await res.text();
  if (!res.ok) throw new Error(`load email_jobs ${res.status}: ${body}`);
  return JSON.parse(body) as EmailJob[];
}

async function claimEmailJob(env: Env, job: EmailJob): Promise<boolean> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/email_jobs?id=eq.${job.id}&status=eq.pending`, {
    method: "PATCH",
    headers: { ...supabaseHeaders(env), prefer: "return=representation" },
    body: JSON.stringify({
      status: "processing",
      attempts: job.attempts + 1,
      last_error: null,
      provider: "resend",
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`claim email_job ${res.status}: ${body}`);
  return (JSON.parse(body) as unknown[]).length > 0;
}

async function markEmailJobSent(env: Env, jobId: string, providerMessageId: string, provider: "resend" | "brevo" = "resend"): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/email_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: supabaseHeaders(env),
    body: JSON.stringify({
      status: "sent",
      provider,
      provider_message_id: providerMessageId || null,
      sent_at: new Date().toISOString(),
      last_error: null,
    }),
  });
  if (!res.ok) throw new Error(`mark sent ${res.status}: ${await res.text()}`);
}

async function markEmailJobFailed(env: Env, job: EmailJob, errorMessage: string): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/email_jobs?id=eq.${job.id}`, {
    method: "PATCH",
    headers: supabaseHeaders(env),
    body: JSON.stringify({
      status: job.attempts + 1 >= job.max_attempts ? "failed" : "pending",
      last_error: errorMessage.slice(0, 2000),
    }),
  });
  if (!res.ok) console.error("markEmailJobFailed error", res.status, await res.text());
}

function dataString(data: Record<string, unknown> | null, key: string): string {
  const value = data?.[key];
  return typeof value === "string" ? value : "";
}

function renderEmailJob(job: EmailJob): { subject: string; html: string; text: string } {
  const data = job.template_data ?? {};
  const firstName = job.recipient_name || "como estas";
  const actionUrl = dataString(data, "action_url") || "https://www.autamedica.com";
  const unsubscribeUrl = dataString(data, "unsubscribe_url") || undefined;

  if (job.job_type === "welcome") {
    const welcome = composeWelcomeEmail(dataString(data, "recipient_role"), actionUrl);
    return renderTransactionalEmail("Bienvenido a AutaMedica", {
      title: `Hola, ${firstName}`,
      preheader: "Tu cuenta en AutaMedica ya esta lista.",
      paragraphs: welcome.paragraphs,
      actionLabel: welcome.actionLabel,
      actionUrl: welcome.actionUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "appointment_reminder") {
    const appointmentTime = dataString(data, "appointment_time");
    return renderTransactionalEmail("AutaMedica · recordatorio de consulta", {
      title: `Hola, ${firstName}`,
      preheader: "Te dejamos los datos de tu proxima consulta en AutaMedica.",
      paragraphs: [
        appointmentTime ? `Tu consulta esta agendada para el ${appointmentTime} hs.` : "Tenes una consulta agendada en AutaMedica.",
        "Te dejamos el acceso a tu agenda para revisar el horario y entrar a la videoconsulta cuando corresponda.",
      ],
      actionLabel: "Ver consulta",
      actionUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "doctor_new_appointment") {
    const appointmentTime = dataString(data, "appointment_time");
    const patientName = dataString(data, "patient_name") || "Un paciente";
    return renderTransactionalEmail("AutaMedica · Nuevo turno agendado", {
      title: `Hola, Dr. ${firstName}`,
      preheader: "Tenes un nuevo turno agendado en AutaMedica.",
      paragraphs: [
        `${patientName} agendó un turno para el ${appointmentTime} hs.`,
        "Podes revisar los detalles de la consulta en tu agenda.",
      ],
      actionLabel: "Ver agenda",
      actionUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "doctor_appointment_cancelled") {
    const appointmentTime = dataString(data, "appointment_time");
    const patientName = dataString(data, "patient_name") || "Un paciente";
    return renderTransactionalEmail("AutaMedica · Turno cancelado", {
      title: `Hola, Dr. ${firstName}`,
      preheader: "Un turno fue cancelado.",
      paragraphs: [
        `${patientName} canceló su turno del ${appointmentTime} hs.`,
        "El horario ya está liberado nuevamente en tu agenda.",
      ],
      actionLabel: "Ver agenda",
      actionUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "doctor_anamnesis_ready") {
    const patientName = dataString(data, "patient_name") || "Un paciente";
    return renderTransactionalEmail("AutaMedica · Anamnesis completada", {
      title: `Hola, Dr. ${firstName}`,
      preheader: "Un paciente completó su historial clínico.",
      paragraphs: [
        `${patientName} acaba de completar su anamnesis.`,
        "Revisá sus antecedentes y motivo de consulta antes de conectarte para ahorrar tiempo.",
      ],
      actionLabel: "Ver historial",
      actionUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "patient_appointment_cancelled") {
    const appointmentTime = dataString(data, "appointment_time");
    const doctorName = dataString(data, "doctor_name") || "El médico";
    return renderTransactionalEmail("AutaMedica · Consulta cancelada", {
      title: `Hola, ${firstName}`,
      preheader: "Tu consulta fue cancelada.",
      paragraphs: [
        `${doctorName} tuvo que cancelar la consulta agendada para el ${appointmentTime} hs.`,
        "Podes ingresar a la plataforma para reagendar un nuevo turno o solicitar un reintegro.",
      ],
      actionLabel: "Ver opciones",
      actionUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "patient_prescription_ready") {
    const doctorName = dataString(data, "doctor_name") || "El médico";
    const pdfUrl = dataString(data, "pdf_url");
    const medicationName = dataString(data, "medication_name");
    const cuir = dataString(data, "cuir");
    const prescriptionUrl = pdfUrl || actionUrl;
    return renderTransactionalEmail("AutaMedica · Tu receta está lista", {
      title: `Hola, ${firstName}`,
      preheader: "Tenés un nuevo documento médico disponible.",
      paragraphs: [
        `${doctorName} emitió una nueva receta o indicación médica para vos.`,
        medicationName ? `Medicamento o indicación: ${medicationName}.` : "La receta ya fue emitida digitalmente.",
        cuir ? `Código de verificación: ${cuir}.` : "Podés descargar el documento desde el enlace seguro.",
      ],
      actionLabel: pdfUrl ? "Descargar PDF" : "Descargar receta",
      actionUrl: prescriptionUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "patient_medical_order_ready") {
    const doctorName = dataString(data, "doctor_name") || "El médico";
    const pdfUrl = dataString(data, "pdf_url");
    const practicesName = dataString(data, "practices_name") || "Orden de estudios médicos";
    const cuir = dataString(data, "cuir");
    const orderUrl = pdfUrl || actionUrl;
    return renderTransactionalEmail("AutaMedica · Tu orden de estudios está lista", {
      title: `Hola, ${firstName}`,
      preheader: "Tenés una orden de estudios disponible.",
      paragraphs: [
        `${doctorName} emitió una nueva orden de estudios complementarios para vos.`,
        practicesName ? `Estudios solicitados: ${practicesName}.` : "La orden de estudios ya fue emitida digitalmente.",
        cuir ? `Código de verificación: ${cuir}.` : "Podés descargar el documento desde el enlace seguro.",
      ],
      actionLabel: pdfUrl ? "Descargar PDF" : "Descargar orden",
      actionUrl: orderUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "community_new_topic") {
    const topicTitle = dataString(data, "topic_title");
    const topicExcerpt = dataString(data, "topic_excerpt");
    const authorName = dataString(data, "author_name");
    const groupName = dataString(data, "group_name");
    return renderTransactionalEmail(`Nuevo tema en la comunidad: ${topicTitle}`, {
      title: "Nuevo tema en la comunidad",
      preheader: `${authorName} creó un nuevo tema en el grupo ${groupName}.`,
      paragraphs: [
        `Hola, ${firstName}.`,
        `**${authorName}** creó un nuevo tema en el grupo **${groupName}**:`,
        `**"${topicTitle}"**`,
        `_"${topicExcerpt}"_`,
        "Ingresá a la plataforma para leer la publicación completa y participar de la conversación."
      ],
      actionLabel: "Ver publicación",
      actionUrl,
      unsubscribeUrl,
    });
  }

  if (job.job_type === "community_new_comment") {
    const topicTitle = dataString(data, "topic_title");
    const commentExcerpt = dataString(data, "comment_excerpt");
    const authorName = dataString(data, "author_name");
    const groupName = dataString(data, "group_name");
    return renderTransactionalEmail(`Nuevo comentario en: ${topicTitle}`, {
      title: "Nuevo comentario en la comunidad",
      preheader: `${authorName} comentó en el tema "${topicTitle}".`,
      paragraphs: [
        `Hola, ${firstName}.`,
        `**${authorName}** comentó en el tema **"${topicTitle}"** del grupo **${groupName}**:`,
        `_"${commentExcerpt}"_`,
        "Ingresá a la plataforma para leer el comentario completo y responder en el hilo."
      ],
      actionLabel: "Ver comentario",
      actionUrl,
      unsubscribeUrl,
    });
  }

  return renderTransactionalEmail("AutaMedica · recordatorio", {
    title: `Hola, ${firstName}`,
    preheader: "Te dejamos el enlace para continuar tu proceso en AutaMedica.",
    paragraphs: [
      "Te escribo para que puedas continuar el proceso que quedo pendiente.",
      "Completar tus datos antes de la consulta ayuda a que el medico entre con contexto, sin empezar desde cero.",
    ],
    actionLabel: "Continuar",
    actionUrl,
    unsubscribeUrl,
  });
}

function getFirstName(job: EmailJob): string {
  return job.recipient_name || "como estas";
}

function getBrevoParamsForJob(job: EmailJob): {
  subject: string;
  title: string;
  subtitle: string;
  body_html: string;
  cta_url?: string;
  cta_label?: string;
  secondary_url?: string;
  secondary_label?: string;
  signature_name: string;
} {
  const data = job.template_data ?? {};
  const actionUrl = dataString(data, "action_url");
  const recipientName = escapeHtml(getFirstName(job));

  let subject = "AutaMedica";
  let title = `Hola, ${recipientName}`;
  let subtitle = "";
  let paragraphs: string[] = [];
  let ctaLabel = "";
  let ctaUrl = actionUrl;

  if (job.job_type === "welcome") {
    const welcome = composeWelcomeEmail(dataString(data, "recipient_role"), actionUrl);
    subject = "Bienvenido a AutaMedica";
    title = `Hola, ${recipientName}`;
    paragraphs = welcome.paragraphs;
    ctaLabel = welcome.actionLabel;
    ctaUrl = welcome.actionUrl;
  } else if (job.job_type === "anamnesis_reminder") {
    subject = "AutaMedica · recordatorio";
    title = `Hola, ${recipientName}`;
    paragraphs = [
      "Te escribo para que puedas continuar el proceso que quedo pendiente.",
      "Completar tus datos antes de la consulta ayuda a que el medico entre con contexto, sin empezar desde cero.",
    ];
    ctaLabel = "Continuar";
    ctaUrl = actionUrl || "https://www.autamedica.com/patients/anamnesis";
  } else if (job.job_type === "appointment_reminder") {
    const appointmentTime = escapeHtml(dataString(data, "appointment_time"));
    subject = "AutaMedica · recordatorio de consulta";
    title = `Hola, ${recipientName}`;
    paragraphs = [
      appointmentTime
        ? `Tu consulta esta agendada para el ${appointmentTime} hs.`
        : "Tenes una consulta agendada en AutaMedica.",
      "Te dejamos el acceso a tu agenda para revisar el horario y entrar a la videoconsulta cuando corresponda.",
    ];
    ctaLabel = "Ver consulta";
    ctaUrl = actionUrl || "https://www.autamedica.com/patients/appointments";
  } else if (job.job_type === "doctor_new_appointment") {
    const appointmentTime = escapeHtml(dataString(data, "appointment_time"));
    const patientName = escapeHtml(dataString(data, "patient_name") || "Un paciente");
    subject = "AutaMedica · consulta pagada y confirmada";
    title = "Consulta pagada y confirmada";
    paragraphs = [
      appointmentTime
        ? `${patientName} confirmo el pago de una consulta para el ${appointmentTime}.`
        : `${patientName} confirmo el pago de una consulta.`,
      "Ya podes revisar los detalles desde tu agenda medica.",
    ];
    ctaLabel = "Ver agenda";
    ctaUrl = actionUrl || "https://doctor.autamedica.com/doctors/appointments";
  } else if (job.job_type === "doctor_appointment_cancelled") {
    const appointmentTime = escapeHtml(dataString(data, "appointment_time"));
    const patientName = escapeHtml(dataString(data, "patient_name") || "Un paciente");
    subject = "AutaMedica · cita cancelada";
    title = `Hola, ${recipientName}`;
    paragraphs = [
      appointmentTime
        ? `${patientName} cancelo la consulta del ${appointmentTime} hs.`
        : `${patientName} cancelo una consulta.`,
      "Tu agenda ya refleja el cambio.",
    ];
    ctaLabel = "Ver agenda";
    ctaUrl = actionUrl || "https://doctor.autamedica.com/doctors/appointments";
  } else if (job.job_type === "patient_appointment_cancelled") {
    const appointmentTime = escapeHtml(dataString(data, "appointment_time"));
    const doctorName = escapeHtml(dataString(data, "doctor_name") || "Tu medico");
    subject = "AutaMedica · cita cancelada";
    title = `Hola, ${recipientName}`;
    paragraphs = [
      appointmentTime
        ? `${doctorName} cancelo la consulta del ${appointmentTime} hs.`
        : `${doctorName} cancelo una consulta.`,
      "Podes revisar tus turnos y agendar uno nuevo desde tu portal.",
    ];
    ctaLabel = "Ver turnos";
    ctaUrl = actionUrl || "https://www.autamedica.com/patients/appointments";
  } else if (job.job_type === "doctor_anamnesis_ready") {
    const patientName = escapeHtml(dataString(data, "patient_name") || "Un paciente");
    subject = "AutaMedica · anamnesis disponible";
    title = `Hola, ${recipientName}`;
    paragraphs = [
      `${patientName} completo su anamnesis preconsulta.`,
      "Ya podes revisarla desde el panel medico.",
    ];
    ctaLabel = "Ver paciente";
    ctaUrl = actionUrl || "https://doctor.autamedica.com/doctors/patients";
  } else if (job.job_type === "patient_prescription_ready") {
    const doctorName = escapeHtml(dataString(data, "doctor_name") || "Tu medico");
    const pdfUrl = dataString(data, "pdf_url");
    const medicationName = escapeHtml(dataString(data, "medication_name"));
    const cuir = escapeHtml(dataString(data, "cuir"));

    subject = "AutaMedica Recetas · receta digital enviada con éxito";
    title = "Receta digital enviada con éxito";
    subtitle = `Hola, ${recipientName}. Tu receta digital de AutaMedica ya está disponible para descargar.`;
    paragraphs = [
      `${doctorName} emitió una receta digital para vos.`,
    ];
    if (medicationName) {
      paragraphs.push(`<strong>Medicamento o indicación:</strong> ${medicationName}.`);
    }
    if (cuir) {
      paragraphs.push(`<strong>Código de receta:</strong> ${cuir}.`);
    }
    paragraphs.push("Presentá la receta en la farmacia o guardala para tu seguimiento médico.");
    paragraphs.push("Seguí la indicación médica recibida. Si tenés dudas sobre el uso del medicamento, síntomas nuevos o una urgencia, consultá con un profesional de salud.");
    ctaLabel = pdfUrl ? "Descargar receta" : "Ver receta";
    ctaUrl = pdfUrl || actionUrl || "https://www.autamedica.com/patients/prescriptions";
  } else if (job.job_type === "patient_medical_order_ready") {
    const doctorName = escapeHtml(dataString(data, "doctor_name") || "Tu medico");
    const pdfUrl = dataString(data, "pdf_url");
    const practicesName = escapeHtml(dataString(data, "practices_name") || "Orden de estudios médicos");
    const cuir = escapeHtml(dataString(data, "cuir"));

    subject = "AutaMedica · orden de estudios disponible";
    title = `Hola, ${recipientName}`;
    paragraphs = [
      `Dr. <strong>${doctorName}</strong> emitió una nueva orden de estudios complementarios para vos.`,
      "Ya está disponible en tu perfil para que puedas descargarla o utilizarla.",
    ];
    if (practicesName) {
      paragraphs.push(`<strong>Estudios solicitados:</strong> ${practicesName}.`);
    }
    if (cuir) {
      paragraphs.push(`<strong>Código de verificación:</strong> ${cuir}.`);
    }
    ctaLabel = pdfUrl ? "Descargar PDF" : "Ver orden";
    ctaUrl = pdfUrl || actionUrl || "https://www.autamedica.com/patients/medical-orders";
  } else if (job.job_type === "nurturing") {
    const templateKey = escapeHtml(dataString(data, "template_key"));
    ctaUrl = dataString(data, "action_url") || "https://www.autamedica.com/patients/anamnesis";
    subject = "AutaMedica";
    title = `Hola, ${recipientName}`;
    if (templateKey === "science_backed") {
      subject = "AutaMedica · la evidencia detras de tu salud";
      paragraphs = [
        "En AutaMedica nos basamos en la mejor evidencia cientifica disponible.",
        "Completar tu anamnesis nos ayuda a entender mejor tu historial y ofrecerte recomendaciones personalizadas.",
      ];
    } else if (templateKey === "time_efficiency") {
      subject = "AutaMedica · optimiza tu tiempo de consulta";
      paragraphs = [
        "Sabemos que tu tiempo es valioso.",
        "Al completar tu anamnesis con anticipacion, tu consulta medica es mucho mas eficiente y enfocada.",
      ];
    } else {
      paragraphs = [
        "Te invitamos a continuar con tu proceso en AutaMedica.",
        "Tus respuestas estan seguras y encriptadas bajo los mas altos estandares de privacidad.",
      ];
    }
    ctaLabel = "Completar anamnesis";
  } else if (job.job_type === "newsletter") {
    subject = escapeHtml(dataString(data, "subject") || "Novedades de AutaMedica");
    title = escapeHtml(dataString(data, "title") || "Estimado/a Colega,");
    subtitle = escapeHtml(dataString(data, "subtitle") || "");
    const rawParagraphs = data["paragraphs"];
    if (Array.isArray(rawParagraphs)) {
      paragraphs = rawParagraphs.map((p) => escapeHtml(String(p)));
    } else {
      paragraphs = ["Te compartimos novedades de AutaMedica."];
    }
    ctaLabel = escapeHtml(dataString(data, "action_label") || "Ver mas");
    ctaUrl = actionUrl || "https://www.autamedica.com";
  } else {
    subject = escapeHtml(dataString(data, "subject") || "AutaMedica");
    title = escapeHtml(dataString(data, "title") || `Hola, ${recipientName}`);
    paragraphs = ["Te compartimos una actualización de AutaMedica."];
    ctaLabel = "Abrir AutaMedica";
    ctaUrl = actionUrl || "https://www.autamedica.com";
  }

  const bodyHtml = paragraphs
    .map((p) => `<p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 16px;">${p}</p>`)
    .join("");

  return {
    subject,
    title,
    subtitle,
    body_html: bodyHtml,
    cta_url: ctaUrl,
    cta_label: ctaLabel,
    secondary_url: ctaUrl,
    secondary_label: "Si el boton no abre, copia este enlace:",
    signature_name: "AutaMedica",
  };
}

function renderTransactionalEmail(
  subject: string,
  input: {
    title: string;
    preheader: string;
    paragraphs: string[];
    actionLabel: string;
    actionUrl: string;
    unsubscribeUrl?: string;
  },
): { subject: string; html: string; text: string } {
  const paragraphs = input.paragraphs.map((paragraph) => {
    // Convert **bold** and *italic* BEFORE escaping HTML
    let t = paragraph;
    t = t.replace(/\*\*(.*?)\*\*/g, '{{B}}$1{{/B}}');
    t = t.replace(/\*(.*?)\*/g, '{{I}}$1{{/I}}');
    t = escapeHtml(t);
    t = t.replace(/\{\{B\}\}/g, '<strong style="color:#111827">').replace(/\{\{\/B\}\}/g, '</strong>');
    t = t.replace(/\{\{I\}\}/g, '<em>').replace(/\{\{\/I\}\}/g, '</em>');
    return '<p>' + t + '</p>';
  }).join("");
  const unsubscribe = input.unsubscribeUrl
    ? `<a href="${escapeAttr(input.unsubscribeUrl)}" style="font-size:12px;">Darse de baja</a>`
    : "";
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title><style>body{margin:0;padding:0;background-color:#F8FAFC;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0F172A}.email-container{max-width:600px;margin:40px auto;background-color:#FFFFFF;border-radius:28px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 20px 40px rgba(15,23,42,.06)}.content{padding:44px 46px 42px;line-height:1.75}h1{font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.18;font-weight:700;color:#020617;margin:0 0 8px;letter-spacing:0}p{font-size:16px;margin:0 0 24px;color:#475569}.button{background-color:#020617;color:#FFFFFF!important;padding:15px 30px;text-decoration:none;border-radius:9999px;font-weight:700;display:inline-block;font-size:15px}.footer{padding:32px 40px 38px;text-align:center;font-size:13px;color:#64748B;border-top:1px solid #F1F5F9}.footer a{color:#64748B}@media(max-width:640px){.email-container{margin:0;border-radius:0}.content{padding:34px 24px 36px}h1{font-size:27px}}</style></head><body><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div><div class="email-container"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td background="${escapeAttr(AUTAMEDICA_BRAND_GIF_URL)}" bgcolor="#EAF6FF" width="600" height="220" style="background-image:url('${escapeAttr(AUTAMEDICA_BRAND_GIF_URL)}');background-repeat:no-repeat;background-position:center;background-size:contain;height:220px;border-bottom:1px solid #F1F5F9;"></td></tr></table><div class="content"><h1>${escapeHtml(input.title)}</h1>${paragraphs}<div style="text-align:center;margin-top:38px;"><a href="${escapeAttr(input.actionUrl)}" class="button">${escapeHtml(input.actionLabel)}</a></div><p style="font-size:13px;color:#64748B;text-align:center;margin-top:18px;">Si el boton no abre, copia este enlace:<br><a href="${escapeAttr(input.actionUrl)}" style="color:#0F172A;word-break:break-word;">${escapeHtml(input.actionUrl)}</a></p><div style="margin-top:38px;"><p style="margin:0 0 4px;color:#475569;">Saludos,</p><p style="margin:0;color:#111827;"><strong>Equipo AutaMedica</strong><br>AutaMedica</p></div></div><div class="footer"><p style="font-size:13px;margin:0 0 10px;">AutaMedica · contacto@autamedica.com</p><p style="font-size:12px;margin:0 0 18px;">Salud digital, continuidad de cuidado y tecnología clínica.</p>${unsubscribe}</div></div></body></html>`;
  const text = [
    input.title,
    "",
    ...input.paragraphs,
    "",
    `${input.actionLabel}: ${input.actionUrl}`,
    "",
    "Equipo AutaMedica",
    "AutaMedica",
    "contacto@autamedica.com",
    input.unsubscribeUrl ? `Darse de baja: ${input.unsubscribeUrl}` : "",
  ].filter(Boolean).join("\n");
  return { subject, html, text };
}

async function sendTransactionalViaResend(
  env: Env,
  job: EmailJob,
  email: { subject: string; html: string; text: string },
): Promise<string> {
  const recipient = job.recipient_email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error(`invalid recipient email: ${job.recipient_email}`);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `AutaMedica <${env.FROM_EMAIL}>`,
      to: [recipient],
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [
        { name: "source", value: "autamedica_email_jobs" },
        { name: "job_type", value: job.job_type },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
  const parsed = JSON.parse(body) as { id?: string };
  return parsed.id ?? "";
}

async function createNewsletterDraft(env: Env): Promise<NewsletterEdition> {
  const built = await buildNewsletter(env);
  const existing = await safeLoadNewsletterEditionByDate(env, built.editionDate);
  if (existing && ["approved", "sending", "sent"].includes(existing.status)) {
    return existing;
  }

  const payload = {
    edition_date: built.editionDate,
    subject: built.subject,
    status: built.summaries.length > 0 ? "draft" : "skipped",
    html: built.html,
    candidates: built.candidates,
    summaries: built.summaries,
    provider: null,
    provider_message_id: null,
    sent_at: null,
    error_message: null,
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/newsletter_editions?on_conflict=edition_date`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(env),
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    await logPublish(env, {
      channel: "newsletter_draft",
      status: "error",
      error_message: `create draft ${res.status}: ${body}`,
      payload: { subject: built.subject, accepted: built.summaries.length },
    });
    throw new Error(`create newsletter draft ${res.status}: ${body}`);
  }
  const rows = JSON.parse(body) as NewsletterEdition[];
  const edition = rows[0];
  await logPublish(env, {
    channel: "newsletter_draft",
    status: edition.status === "skipped" ? "skipped" : "success",
    payload: {
      id: edition.id,
      subject: edition.subject,
      edition_date: edition.edition_date,
      candidates: built.candidates.length,
      accepted: built.summaries.length,
    },
  });
  await notifyNewsletterDraft(env, edition, built);
  return edition;
}

async function loadNewsletterEditionByDate(env: Env, editionDate: string): Promise<NewsletterEdition | null> {
  const select = "id,edition_date,subject,status,html,candidates,summaries,provider,provider_message_id,sent_at,error_message,created_at,updated_at";
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/newsletter_editions?edition_date=eq.${encodeURIComponent(editionDate)}&select=${select}&limit=1`,
    { headers: supabaseHeaders(env) },
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`load newsletter edition by date ${res.status}: ${body}`);
  const rows = JSON.parse(body) as NewsletterEdition[];
  return rows[0] ?? null;
}

async function safeLoadNewsletterEditionByDate(env: Env, editionDate: string): Promise<NewsletterEdition | null> {
  try {
    return await loadNewsletterEditionByDate(env, editionDate);
  } catch (error) {
    console.error("safeLoadNewsletterEditionByDate fallback", error);
    return null;
  }
}

async function loadNewsletterEdition(env: Env, id: string | null): Promise<NewsletterEdition | null> {
  const select = "id,edition_date,subject,status,html,candidates,summaries,provider,provider_message_id,sent_at,error_message,created_at,updated_at";
  const filter = id
    ? `id=eq.${encodeURIComponent(id)}&select=${select}&limit=1`
    : `select=${select}&order=created_at.desc&limit=1`;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/newsletter_editions?${filter}`, {
    headers: supabaseHeaders(env),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`load newsletter edition ${res.status}: ${body}`);
  const rows = JSON.parse(body) as NewsletterEdition[];
  return rows[0] ?? null;
}

async function safeLoadNewsletterEdition(env: Env, id: string | null): Promise<NewsletterEdition | null> {
  try {
    return await loadNewsletterEdition(env, id);
  } catch (error) {
    console.error("safeLoadNewsletterEdition fallback", error);
    return null;
  }
}

async function approveNewsletterEdition(env: Env, id: string | null): Promise<NewsletterEdition> {
  const edition = await loadNewsletterEdition(env, id);
  if (!edition) throw new Error("No hay edicion de newsletter para aprobar");
  if (edition.status === "sent") return edition;
  if (edition.status === "skipped") {
    throw new Error("La edicion esta en skipped porque no tiene notas aceptadas");
  }
  return updateNewsletterEdition(env, edition.id, { status: "approved", error_message: null });
}

async function sendNewsletterEdition(env: Env, id: string | null): Promise<NewsletterEdition> {
  const loaded = await loadNewsletterEdition(env, id);
  if (!loaded) throw new Error("No hay edicion de newsletter para enviar");
  if (loaded.status === "sent") return loaded;
  if (loaded.status === "skipped") {
    throw new Error("La edicion esta en skipped porque no tiene notas aceptadas");
  }

  await updateNewsletterEdition(env, loaded.id, { status: "sending", error_message: null });
  try {
    const result = await sendNewsletterHtml(env, loaded.subject, loaded.html);
    return await updateNewsletterEdition(env, loaded.id, {
      status: "sent",
      provider: result.provider,
      provider_message_id: result.id,
      sent_at: new Date().toISOString(),
      error_message: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateNewsletterEdition(env, loaded.id, { status: "failed", error_message: message.slice(0, 2000) });
    throw error;
  }
}

async function updateNewsletterEdition(
  env: Env,
  id: string,
  patch: Partial<NewsletterEdition>,
): Promise<NewsletterEdition> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/newsletter_editions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...supabaseHeaders(env), prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`update newsletter edition ${res.status}: ${body}`);
  const rows = JSON.parse(body) as NewsletterEdition[];
  return rows[0];
}

async function sendNewsletterHtml(env: Env, subject: string, html: string): Promise<SendResult> {
  await assertNewsletterAudienceAligned(env);

  try {
    console.log("Intentando envio primario via Resend...");
    return await sendViaResend(env, subject, html);
  } catch (err) {
    console.error("Resend fallo, activando fallback Brevo:", (err as Error).message);
    return await sendViaBrevo(env, subject, html);
  }
}

async function assertNewsletterAudienceAligned(env: Env): Promise<void> {
  const [profiles, contacts] = await Promise.all([
    loadNewsletterProfiles(env),
    loadResendContacts(env),
  ]);

  const dbActive = new Set(
    profiles
      .filter((profile) => profile.newsletter_subscribed === true)
      .map((profile) => normalizeEmail(profile.email))
      .filter((email) => Boolean(email) && !email.startsWith("deleted+") && !email.endsWith("@invalid.autamedica")),
  );
  const resendActive = new Set(
    contacts
      .filter((contact) => contact.unsubscribed !== true)
      .map((contact) => normalizeEmail(contact.email))
      .filter(Boolean),
  );

  const extraInResend = difference(resendActive, dbActive);
  const missingInResend = difference(dbActive, resendActive);

  if (extraInResend.length === 0 && missingInResend.length === 0) return;

  const sample = {
    extra_in_resend: extraInResend.slice(0, 10),
    missing_in_resend: missingInResend.slice(0, 10),
  };
  throw new Error(
    [
      "Newsletter audience desincronizada; envio bloqueado.",
      `Supabase activos=${dbActive.size}`,
      `Resend activos=${resendActive.size}`,
      `sobrantes_en_resend=${extraInResend.length}`,
      `faltantes_en_resend=${missingInResend.length}`,
      `muestra=${JSON.stringify(sample)}`,
      "Ejecuta scripts/sync-newsletter-audience.mjs --apply antes de enviar.",
    ].join(" "),
  );
}

async function loadNewsletterProfiles(env: Env): Promise<NewsletterProfile[]> {
  const select = "user_id,email,first_name,last_name,newsletter_subscribed";
  const rows: NewsletterProfile[] = [];
  let from = 0;
  const pageSize = 1000;

  for (;;) {
    const to = from + pageSize - 1;
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?select=${select}&email=not.is.null&order=created_at.asc`,
      {
        headers: {
          ...supabaseHeaders(env, "public"),
          range: `${from}-${to}`,
        },
      },
    );
    const body = await res.text();
    if (!res.ok) throw new Error(`load newsletter profiles ${res.status}: ${body}`);
    const page = JSON.parse(body) as NewsletterProfile[];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function loadResendContacts(env: Env): Promise<ResendContact[]> {
  const rows: ResendContact[] = [];
  let afterId: string | undefined = undefined;
  const audienceId = env.RESEND_AUDIENCE_ID;

  for (;;) {
    if (!audienceId) throw new Error("RESEND_AUDIENCE_ID no configurada");
    const url = new URL(`https://api.resend.com/segments/${encodeURIComponent(audienceId)}/contacts`);
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after", afterId);

    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, accept: "application/json" },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`load resend contacts ${res.status}: ${body}`);
    const parsed = JSON.parse(body) as { data: ResendContact[]; has_more: boolean };
    
    if (Array.isArray(parsed?.data)) {
      rows.push(...parsed.data);
      if (!parsed.has_more || parsed.data.length === 0) break;
      afterId = parsed.data[parsed.data.length - 1].id;
    } else {
      break;
    }
  }
  return rows;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function difference(left: Set<string>, right: Set<string>): string[] {
  const result: string[] = [];
  for (const value of left) {
    if (!right.has(value)) result.push(value);
  }
  return result.sort();
}

async function notifyNewsletterDraft(env: Env, edition: NewsletterEdition, built: NewsletterBuild): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const baseUrl = env.WORKER_PUBLIC_URL?.replace(/\/$/, "");
  const previewUrl = baseUrl ? `${baseUrl}/preview?id=${encodeURIComponent(edition.id)}` : "";
  const headlines = built.summaries.map((summary) => `- ${summary.headline}`).join("\n") || "- Sin notas aceptadas";
  const message = [
    `AutaMedica newsletter ${edition.edition_date}`,
    `Estado: ${edition.status}`,
    `Candidatas: ${built.candidates.length}`,
    `Aceptadas: ${built.summaries.length}`,
    "",
    headlines,
    previewUrl ? `\nPreview: ${previewUrl}` : "",
  ].filter(Boolean).join("\n");

  try {
    const authParam = `&key=${encodeURIComponent(env.TRIGGER_KEY)}`;
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
        reply_markup: baseUrl ? {
          inline_keyboard: [
            [
              { text: "✅ Aprobar y enviar", url: `${baseUrl}/newsletter/approve?id=${encodeURIComponent(edition.id)}${authParam}` },
              { text: "👁 Preview", url: `${baseUrl}/preview?id=${encodeURIComponent(edition.id)}${authParam}` },
            ],
          ],
        } : undefined,
      }),
    });
    if (!res.ok) {
      console.error("telegram notification failed", res.status, await res.text());
    }
  } catch (error) {
    console.error("telegram notification error", error);
  }
}

async function buildNewsletter(env: Env): Promise<NewsletterBuild> {
  const feeds = env.RSS_FEEDS.split(",").map((s) => s.trim()).filter(Boolean);
  const items = await fetchAllFeeds(feeds);
  const candidates = rankRecent(items).filter((item) => !shouldRejectBeforeAi(item)).slice(0, MAX_CANDIDATES);
  const enriched = await Promise.all(candidates.map(enrichWithArticleBody));
  const evaluated = await Promise.all(enriched.map((item) => summarizeItem(env, item)));
  const accepted = evaluated.filter((x): x is Summary => x !== null).slice(0, MAX_ITEMS_TO_SUMMARIZE);
  const subject = `${env.SUBJECT_PREFIX} · ${formatDateAR()}`;
  return {
    subject,
    html: renderHtml(accepted, env),
    candidates,
    summaries: accepted,
    editionDate: localDateISO(),
  };
}

function shouldRejectBeforeAi(item: NewsItem): boolean {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const blockedPatterns = [
    /\bdeath\b|\bdead\b|\bdied\b|\bmass grave\b|\bpandemic\b|\bplague\b|\bcrisis\b|\bcollapse\b/,
    /\btraffick|\bsexual exploitation\b|\babuse\b|\bviolence\b|\bcrime\b|\bsuicide\b|\bwar\b/,
    /\bgraphene\b|\bnanoparticle\b|\bsuperbug\b|\bin vitro\b|\bcell culture\b|\bmouse model\b|\bmice\b/,
    /\bdepression\b|\bsuicide risk\b|\banhedonia\b|\bfragile x\b|\balzheimer\b|\bdementia\b|\bseizure\b/,
    /\bfish oil\b|\bomega-3\b|\bcarnivore diet\b|\bvisceral fat\b/,
    /\badult twins\b|\bhow do i\b|\badvice\b/,
  ];
  return blockedPatterns.some((pattern) => pattern.test(text));
}

async function enrichWithArticleBody(item: NewsItem): Promise<NewsItem> {
  if (item.description.length > 1200) return item;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
    const res = await fetch(item.link, {
      headers: { "user-agent": "AutaMedicaNewsletterBot/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return item;
    const html = await res.text();
    const body = extractArticleText(html);
    if (body.length > item.description.length) {
      return { ...item, description: body.slice(0, MAX_ARTICLE_CHARS) };
    }
    return item;
  } catch {
    return item;
  }
}

function extractArticleText(html: string): string {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const bodySection = articleMatch?.[1] ?? mainMatch?.[1] ?? html;
  return bodySection
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAllFeeds(feeds: string[]): Promise<NewsItem[]> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const results = await Promise.allSettled(
    feeds.map(async (url) => {
      const res = await fetch(url, { headers: { "user-agent": "AutaMedicaNewsletterBot/1.0" } });
      if (!res.ok) throw new Error(`${url} ${res.status}`);
      const xml = await res.text();
      const parsed = asRecord(parser.parse(xml));
      const rss = asRecord(parsed.rss);
      const rssChannel = asRecord(rss.channel);
      const channel = Object.keys(rssChannel).length > 0 ? rssChannel : asRecord(parsed.feed);
      const sourceTitle = typeof channel.title === "string" ? channel.title : new URL(url).hostname;
      const rawItems = channel.item ?? channel.entry ?? [];
      const arr = Array.isArray(rawItems) ? rawItems : [rawItems];
      return arr
        .slice(0, MAX_ITEMS_PER_FEED)
        .map((it: unknown) => normalizeItem(asRecord(it), sourceTitle));
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

function normalizeItem(it: Record<string, unknown>, source: string): NewsItem {
  const linkValue = typeof it.link === "string" ? it.link : asRecord(it.link)["@_href"];
  const link = typeof linkValue === "string" ? linkValue : "";
  return {
    title: stripTags(String(it.title ?? "")),
    link,
    description: stripTags(String(it.description ?? it.summary ?? "")).slice(0, 600),
    pubDate: String(it.pubDate ?? it.published ?? it.updated ?? ""),
    source,
  };
}

function rankRecent(items: NewsItem[]): NewsItem[] {
  return items
    .map((i) => ({ i, t: Date.parse(i.pubDate) || 0 }))
    .sort((a, b) => b.t - a.t)
    .map((x) => x.i);
}

async function summarizeItem(env: Env, item: NewsItem): Promise<Summary | null> {
  const prompt = `Sos el editor médico de "AutaMedica". Vas a escribir una breve pieza editorial sobre una noticia científica.
Tu tono es analítico, extremadamente prudente, sobrio y corto (párrafos de 1 a 2 oraciones máximo).
Cero humo, cero IA ("sorprendentemente", "en conclusión"). NO des "consejos prácticos" ni life-hacks exagerados. Usa "el microbioma", no "la microbioma".

FORMATO OBLIGATORIO: Usá **negrita** para los conceptos clave, nombres de bacterias o datos duros (ej: **Morganella morganii**, **IL-6**, **80 años**). No abuses: 1-2 negritas por párrafo máximo.

Primero, evaluá si esta noticia PASA O NO PASA. Son 6 filtros binarios. Si FALLA UNO SOLO, devolve {"skip": true}. Sin excepciones.

FILTRO 1 — ¿Es positiva? SI el artículo habla de muerte, pandemia, crisis, colapso, enfermedad terminal o sufrimiento → NO PASA.
FILTRO 2 — ¿Tiene ciencia real? SI no hay estudio, paper o ensayo clínico verificable → NO PASA.
FILTRO 3 — ¿Sirve para la vida diaria? SI el hallazgo no se traduce en algo que una persona común pueda hacer, entender o prevenir hoy → NO PASA.
FILTRO 4 — ¿Puede asustar o confundir? SI un lector NO médico podría interpretar el artículo como "X es malo" o "Y es un mito" cuando en realidad el estudio aplica a un caso clínico muy específico → NO PASA. Ejemplo: un estudio que dice que el EPA interfiere con la recuperación de lesiones craneales repetidas NO puede publicarse porque el lector va a concluir "el omega-3 es malo". Eso es inaceptable.
FILTRO 5 — ¿Evita trauma o daño social? SI el artículo trata violencia, abuso, trata, explotación sexual, crimen, suicidio, guerra, catástrofes o recuperación de víctimas → NO PASA aunque sea esperanzador.
FILTRO 6 — ¿No es investigación de laboratorio aislada? SI el hallazgo es sobre materiales, nanopartículas, bacterias in vitro, dispositivos experimentales, modelos animales o tecnología sin aplicación cotidiana directa → NO PASA.

Si NO pasa los 6 filtros, devolve exactamente: {"skip": true}

Si SI pasa, devolve JSON con body de 5 a 7 oraciones con esta estructura:
1. Lead: el hallazgo concreto con dato duro.
2. La actividad cotidiana conectada.
3. Por qué funciona: mecanismo biológico preciso.
4. La instrucción para hoy: detalle concreto (qué hacer, cuánto, cómo).
5. Cierre con textura: una cita del estudio, un dato curioso, o el pivote AutaMedica (registrar estos hábitos en la historia clínica ANTES de la consulta cambia la lectura del caso).

Usa saltos de línea (\\n\\n) entre párrafos. El body debe ser texto plano con \\n\\n y **negrita**, sin HTML.

Titulo original: ${item.title}
Fuente: ${item.source}
Contenido: ${item.description.slice(0, MAX_ARTICLE_CHARS)}

Devolve SOLO JSON valido, sin markdown envolvente:
{"headline": "Titulo editorial sobrio, sin exclamaciones", "body": "Texto con \\n\\n entre párrafos y **negrita** en conceptos clave"}
o bien si es una noticia sobre crisis/muerte o no aporta nada clínico: {"skip": true}`;

  const parsed = await callGemini(env, prompt);
  if (!parsed || parsed.skip === true) return null;
  if (!parsed.headline || !parsed.body) return null;
  return { headline: parsed.headline, body: parsed.body, link: item.link, source: item.source, originalTitle: item.title };
}

async function callGemini(env: Env, prompt: string): Promise<GeminiSummaryResponse | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) return null;
  const data = asRecord(await res.json());
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const firstCandidate = asRecord(candidates[0]);
  const content = asRecord(firstCandidate.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = asRecord(parts[0]).text;
  const parsed = typeof text === "string" ? safeParseJson(text) : null;
  return parsed as GeminiSummaryResponse | null;
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function renderHtml(summaries: Summary[], env: Env): string {
  const date = formatDateAR();
  const headerImage = escapeAttr(env.HEADER_IMAGE_URL);
  const articleHtml = summaries.map((s, idx) => `
      <article style="margin:0 0 32px 0;padding:0 0 28px 0;${idx === summaries.length - 1 ? "" : "border-bottom:1px solid #F1F5F9;"}">
        <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.24;font-weight:700;color:#020617;margin:0 0 14px 0;letter-spacing:0;">
          <a href="${escapeAttr(s.link)}" style="color:#020617;text-decoration:none;">${escapeHtml(s.headline)}</a>
        </h2>
        <p style="font-size:16px;line-height:1.65;margin:0 0 16px 0;color:#475569;">${((b) => { b = b.replace(/\*\*(.*?)\*\*/g, '{{B}}$1{{/B}}'); b = b.replace(/\*(.*?)\*/g, '{{I}}$1{{/I}}'); b = escapeHtml(b); b = b.replace(/\{\{B\}\}/g, '<strong style="color:#111827">').replace(/\{\{\/B\}\}/g, '</strong>'); b = b.replace(/\{\{I\}\}/g, '<em>').replace(/\{\{\/I\}\}/g, '</em>'); return b; })(s.body)}</p>
        <p style="font-size:11px;line-height:1.4;margin:0;color:#64748B;text-transform:uppercase;font-weight:700;">${escapeHtml(s.source)}</p>
      </article>`).join("");

  const emptyState = `
      <div class="note">
        <p style="margin:0;"><strong>Edicion en revision:</strong><br>
        Hoy el filtro editorial dejo las noticias en espera. Priorizamos publicar hallazgos utiles, verificables y conectados con habitos cotidianos.</p>
      </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsletter AutaMedica</title>
  <style>
    body { margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0F172A; }
    .email-container { max-width: 600px; margin: 40px auto; background-color: #FFFFFF; border-radius: 28px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 20px 40px rgba(15,23,42,0.06); }
    .content { padding: 44px 46px 42px; line-height: 1.75; }
    h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 30px; line-height: 1.18; font-weight: 700; color: #020617; margin: 0 0 22px; letter-spacing: 0; }
    p { font-size: 16px; margin: 0 0 24px; color: #475569; }
    strong { color: #111827; }
    .eyebrow { font-size: 11px; color: #00A3FF; margin: 0 0 12px 0; text-transform: uppercase; font-weight: 800; }
    .note { background-color: #F8FAFC; padding: 22px; border-radius: 18px; margin: 30px 0 0; border-left: 4px solid #00A3FF; }
    .footer { padding: 32px 40px 38px; text-align: center; font-size: 13px; color: #64748B; border-top: 1px solid #F1F5F9; }
    .footer a { color: #64748B; }
    @media (max-width: 640px) {
      .email-container { margin: 0; border-radius: 0; }
      .content { padding: 34px 24px 36px; }
      h1 { font-size: 27px; }
    }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Salud Digital · ${escapeHtml(date)}</div>
  <div class="email-container">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td
          background="${headerImage}"
          bgcolor="#EAF6FF"
          width="600"
          height="220"
          style="background-image:url('${headerImage}');background-repeat:no-repeat;background-position:center;background-size:contain;height:220px;border-bottom:1px solid #F1F5F9;"
        ></td>
      </tr>
    </table>

    <div class="content">
      <p class="eyebrow">Salud Digital · ${escapeHtml(date)}</p>
      <h1>Novedades Clínicas</h1>
      ${articleHtml || emptyState}

      <div style="margin-top:38px;">
        <p style="margin:0 0 4px;color:#475569;">Saludos,</p>
        <p style="margin:0;color:#111827;"><strong>Equipo AutaMedica</strong><br>AutaMedica</p>
      </div>
    </div>

    <div class="footer">
      <p style="font-size:13px;margin:0 0 10px;">AutaMedica · contacto@autamedica.com</p>
      <p style="font-size:12px;margin:0 0 18px;">Salud digital, continuidad de cuidado y tecnología clínica.</p>
      <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="font-size:12px;">Darse de baja</a>
    </div>
  </div>
</body>
</html>`;
}

async function sendViaResend(env: Env, subject: string, html: string): Promise<SendResult> {
  const enabled = await checkKillswitch(env, KILLSWITCH_CHANNEL);
  if (!enabled) throw new Error("Killswitch activo para Resend");

  const createRes = await fetch("https://api.resend.com/broadcasts", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ segment_id: env.RESEND_AUDIENCE_ID, from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`, subject, html, name: subject }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    await logPublish(env, { channel: "email_resend", status: "error", error_message: `create broadcast ${createRes.status}: ${body}`, payload: { subject } });
    throw new Error(`Resend Create Fail: ${createRes.status}: ${body}`);
  }
  const { id } = (await createRes.json()) as { id: string };
  const sendRes = await fetch(`https://api.resend.com/broadcasts/${id}/send`, { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({}) });
  if (!sendRes.ok) {
    const body = await sendRes.text();
    await logPublish(env, { channel: "email_resend", status: "error", error_message: `send broadcast ${sendRes.status}: ${body}`, payload: { subject, broadcast_id: id } });
    throw new Error(`Resend Send Fail: ${sendRes.status}: ${body}`);
  }
  await logPublish(env, { channel: "email_resend", status: "success", payload: { subject, broadcast_id: id } });
  return { provider: "resend", id };
}

async function sendViaBrevo(env: Env, subject: string, html: string): Promise<SendResult> {
  if (!env.BREVO_API_KEY) throw new Error("BREVO_API_KEY no configurada");
  const listIds = parseNumberList(env.BREVO_LIST_IDS);
  if (listIds.length > 0) {
    return sendBrevoCampaign(env, subject, html, listIds);
  }

  const recipients = parseRecipients(env.BREVO_NEWSLETTER_RECIPIENTS || env.FROM_EMAIL);
  if (recipients.length === 0) throw new Error("No hay destinatarios configurados para Brevo");
  let lastMessageId = "";
  let sent = 0;
  for (const recipient of recipients) {
    const result = await sendBrevoSmtp(env, subject, html, recipient);
    lastMessageId = result;
    sent += 1;
  }
  await logPublish(env, { channel: "email_brevo", status: "success", payload: { subject, fallback: true, mode: "smtp", sent } });
  return { provider: "brevo_smtp", id: lastMessageId, count: sent };
}

async function sendBrevoCampaign(env: Env, subject: string, html: string, listIds: number[]): Promise<SendResult> {
  const createRes = await fetch("https://api.brevo.com/v3/emailCampaigns", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      name: subject,
      sender: { name: env.FROM_NAME, email: env.FROM_EMAIL },
      subject,
      htmlContent: normalizeUnsubscribeLinks(html),
      recipients: { listIds },
      replyTo: env.FROM_EMAIL,
      tag: "autamedica-newsletter",
      utmCampaign: "autamedica_newsletter",
    }),
  });
  const createBody = await createRes.text();
  if (!createRes.ok) {
    await logPublish(env, { channel: "email_brevo", status: "error", error_message: `create campaign ${createRes.status}: ${createBody}`, payload: { subject, listIds } });
    throw new Error(`Brevo Campaign Create Fail: ${createRes.status}: ${createBody}`);
  }
  const campaign = JSON.parse(createBody) as { id: number };
  const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendNow`, {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const sendBody = await sendRes.text();
  if (!sendRes.ok) {
    await logPublish(env, { channel: "email_brevo", status: "error", error_message: `send campaign ${sendRes.status}: ${sendBody}`, payload: { subject, campaign_id: campaign.id } });
    throw new Error(`Brevo Campaign Send Fail: ${sendRes.status}: ${sendBody}`);
  }
  await logPublish(env, { channel: "email_brevo", status: "success", payload: { subject, campaign_id: campaign.id, mode: "campaign", listIds } });
  return { provider: "brevo_campaign", id: String(campaign.id) };
}

async function sendBrevoSmtp(env: Env, subject: string, html: string, recipient: { email: string; name?: string }): Promise<string> {
  const templateId = Number.parseInt(env.BREVO_DEFAULT_TEMPLATE_ID || String(AUTAMEDICA_BREVO_DEFAULT_TEMPLATE_ID), 10);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: env.FROM_NAME, email: env.FROM_EMAIL },
      to: [{ email: recipient.email, name: recipient.name || recipient.email }],
      templateId,
      params: {
        subject,
        title: subject,
        subtitle: "Newsletter AutaMedica",
        body_html: normalizeUnsubscribeLinks(html),
        cta_url: "https://www.autamedica.com",
        cta_label: "Abrir AutaMedica",
        secondary_url: "https://www.autamedica.com/unsubscribe",
        secondary_label: "Darme de baja",
        signature_name: env.FROM_NAME || "AutaMedica",
      },
      tags: ["newsletter", "autamedica"],
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    await logPublish(env, { channel: "email_brevo", status: "error", error_message: `smtp ${res.status}: ${body}`, payload: { subject, recipient: recipient.email } });
    throw new Error(`Brevo Fail: ${res.status}: ${body}`);
  }
  const parsed = safeParseJson(body) as { messageId?: string } | null;
  return parsed?.messageId ?? "";
}

async function sendTransactionalViaBrevo(
  env: Env,
  job: EmailJob,
  subject: string,
  params: Record<string, string>,
): Promise<string> {
  if (!env.BREVO_API_KEY) throw new Error("BREVO_API_KEY no configurada");

  console.log(`[Brevo SMTP] Sending transactional email: "${subject}" to ${job.recipient_email} for job type ${job.job_type}`);

  const fromEmail = env.FROM_EMAIL || "contacto@autamedica.com";
  const fromName = env.FROM_NAME || "AutaMedica";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: job.recipient_email, name: job.recipient_name || job.recipient_email }],
      templateId: 8,
      params,
      tags: ["transactional", "autamedica", job.job_type],
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Brevo SMTP ${res.status}: ${body}`);
  const parsed = safeParseJson(body) as { messageId?: string } | null;
  return parsed?.messageId ?? "";
}

function normalizeUnsubscribeLinks(html: string): string {
  return html
    .replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "https://www.autamedica.com/unsubscribe")
    .replaceAll("__UNSUBSCRIBE_LINK__", "https://www.autamedica.com/unsubscribe");
}

function parseNumberList(value: string | undefined): number[] {
  return (value ?? "")
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function parseRecipients(value: string): Array<{ email: string; name?: string }> {
  return value
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
      if (match) return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
      return { email: raw.toLowerCase() };
    })
    .filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email));
}

async function checkKillswitch(env: Env, channel: string): Promise<boolean> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/killswitch_state?channel=eq.${channel}&select=enabled`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "accept-profile": "growth_os" },
    });
    const rows = await res.json() as Array<{ enabled?: boolean }>;
    return rows.length === 0 || rows[0].enabled === true;
  } catch { return true; }
}

async function logPublish(env: Env, entry: PublishLogEntry): Promise<void> {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/publish_log`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-profile": "growth_os", "content-type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch (e) { console.error("logPublish error", e); }
}

function stripTags(s: string): string { return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }
function formatDateAR(): string { return new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }); }
function localDateISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(value: string): string { return escapeHtml(value); }
