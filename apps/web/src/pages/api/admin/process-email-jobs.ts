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
  | 'patient_medical_order_ready'
  | 'nurturing'
  | 'community_new_topic'
  | 'community_new_comment';

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
  if (import.meta.env.DEV && import.meta.env.AUTH_BYPASS === 'true') {
    logger.info('[process-email-jobs] Bypassing authorization check due to DEV + AUTH_BYPASS=true');
    return true;
  }

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
  const actionUrl = stringFromData(data, 'action_url') || 'https://doctor.autamedica.com/doctors/appointments';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica · consulta pagada y confirmada', {
    variant: 'transactional',
    title: 'Consulta pagada y confirmada',
    preheader: 'Tenes una consulta confirmada en tu agenda de AutaMedica.',
    paragraphs: [
      appointmentTime
        ? `${patientName} confirmo el pago de una consulta para el ${appointmentTime}.`
        : `${patientName} confirmo el pago de una consulta.`,
      'Ya podes revisar los detalles desde tu agenda medica.',
    ],
    action: { label: 'Ver agenda', url: actionUrl },
    footerText: 'Salud digital, continuidad de cuidado y tecnologia clinica.',
    showPersonalSignature: false,
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
  const pdfUrl = stringFromData(data, 'pdf_url');
  const medicationName = stringFromData(data, 'medication_name');
  const cuir = stringFromData(data, 'cuir');
  const actionUrl =
    pdfUrl ||
    stringFromData(data, 'action_url') ||
    'https://www.autamedica.com/patients/prescriptions';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica Recetas · receta digital enviada con éxito', {
    variant: 'transactional',
    title: 'Receta digital enviada con éxito',
    preheader: 'Tu receta digital de AutaMedica ya está disponible para descargar.',
    intro: `Hola, ${firstName(job)}.`,
    paragraphs: [
      `${doctorName} emitió una receta digital para vos.`,
      medicationName ? `Medicamento o indicación: ${medicationName}.` : 'La receta ya fue emitida digitalmente.',
      cuir ? `Código de receta: ${cuir}.` : 'Podés descargar el documento desde el enlace seguro.',
      'Presentá la receta en la farmacia o guardala para tu seguimiento médico.',
    ],
    note: 'Seguí la indicación médica recibida. Si tenés dudas sobre el uso del medicamento, síntomas nuevos o una urgencia, consultá con un profesional de salud.',
    action: { label: pdfUrl ? 'Descargar receta' : 'Ver receta', url: actionUrl },
    footerText: 'AutaMedica Recetas · Documentación médica digital.',
    showPersonalSignature: false,
    unsubscribeUrl,
  });
}

function renderPatientMedicalOrderReady(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const doctorName = stringFromData(data, 'doctor_name') || 'Tu medico';
  const pdfUrl = stringFromData(data, 'pdf_url');
  const practicesName = stringFromData(data, 'practices_name') || 'Orden de estudios médicos';
  const cuir = stringFromData(data, 'cuir');
  const actionUrl =
    pdfUrl ||
    stringFromData(data, 'action_url') ||
    'https://www.autamedica.com/patients/medical-orders';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  return renderAutamedicaEmail('AutaMedica · orden de estudios disponible', {
    variant: 'transactional',
    title: `Hola, ${firstName(job)}`,
    preheader: 'Tenes una orden de estudios médicos disponible en AutaMedica.',
    paragraphs: [
      `${doctorName} dejo una orden de estudios disponible para vos.`,
      practicesName ? `Estudios solicitados: ${practicesName}.` : 'La orden de estudios ya fue emitida digitalmente.',
      cuir ? `Codigo de verificacion: ${cuir}.` : 'Podes descargar el documento desde el enlace seguro.',
    ],
    action: { label: pdfUrl ? 'Descargar PDF' : 'Ver orden', url: actionUrl },
    unsubscribeUrl,
  });
}

function renderJob(job: EmailJob): RenderedEmail {
  const data = job.template_data ?? {};
  const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com';
  const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

  if (job.job_type === 'welcome') {
    const recipientRole = stringFromData(data, 'recipient_role') === 'doctor' ? 'doctor' : 'patient';
    return buildWelcomeEmail(firstName(job), actionUrl, unsubscribeUrl, recipientRole);
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

  if (job.job_type === 'patient_medical_order_ready') {
    return renderPatientMedicalOrderReady(job);
  }

  if (job.job_type === 'nurturing') {
    const data = job.template_data ?? {};
    const templateKey = stringFromData(data, 'template_key');
    const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com/patients/anamnesis';
    const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;
    return buildNurturingEmail(templateKey, firstName(job), actionUrl, unsubscribeUrl);
  }

  if (job.job_type === 'community_new_topic') {
    const data = job.template_data ?? {};
    const topicTitle = stringFromData(data, 'topic_title');
    const topicExcerpt = stringFromData(data, 'topic_excerpt');
    const authorName = stringFromData(data, 'author_name');
    const groupName = stringFromData(data, 'group_name');
    const actionUrl = stringFromData(data, 'action_url');
    const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

    return renderAutamedicaEmail(`Nuevo tema en la comunidad: ${topicTitle}`, {
      variant: 'transactional',
      title: 'Nuevo tema en la comunidad',
      preheader: `${authorName} creó un nuevo tema en el grupo ${groupName}.`,
      paragraphs: [
        `Hola, ${firstName(job)}.`,
        `**${authorName}** creó un nuevo tema en el grupo **${groupName}**:`,
        `**"${topicTitle}"**`,
        `_"${topicExcerpt}"_`,
        'Ingresá a la plataforma para leer la publicación completa y participar de la conversación.'
      ],
      action: { label: 'Ver publicación', url: actionUrl },
      unsubscribeUrl,
    });
  }

  if (job.job_type === 'community_new_comment') {
    const data = job.template_data ?? {};
    const topicTitle = stringFromData(data, 'topic_title');
    const commentExcerpt = stringFromData(data, 'comment_excerpt');
    const authorName = stringFromData(data, 'author_name');
    const groupName = stringFromData(data, 'group_name');
    const actionUrl = stringFromData(data, 'action_url');
    const unsubscribeUrl = stringFromData(data, 'unsubscribe_url') || undefined;

    return renderAutamedicaEmail(`Nuevo comentario en: ${topicTitle}`, {
      variant: 'transactional',
      title: 'Nuevo comentario en la comunidad',
      preheader: `${authorName} comentó en el tema "${topicTitle}".`,
      paragraphs: [
        `Hola, ${firstName(job)}.`,
        `**${authorName}** comentó en el tema **"${topicTitle}"** del grupo **${groupName}**:`,
        `_"${commentExcerpt}"_`,
        'Ingresá a la plataforma para leer el comentario completo y responder en el hilo.'
      ],
      action: { label: 'Ver comentario', url: actionUrl },
      unsubscribeUrl,
    });
  }


  if (job.job_type === 'newsletter') {
    const rawParagraphs = data.paragraphs;
    let paragraphs: string[] = [];
    if (Array.isArray(rawParagraphs)) {
      paragraphs = rawParagraphs.map((p) => String(p));
    } else {
      paragraphs = ['Te compartimos una actualizacion de AutaMedica.'];
    }
    return renderAutamedicaEmail(stringFromData(data, 'subject') || 'Novedades de AutaMedica', {
      variant: 'newsletter',
      title: stringFromData(data, 'title') || 'Estimado/a Colega,',
      paragraphs,
      action: {
        label: stringFromData(data, 'action_label') || 'Ver mas',
        url: stringFromData(data, 'action_url') || 'https://www.autamedica.com',
      },
      closingName: 'Equipo AutaMedica',
      closingRole: 'AutaMedica',
      unsubscribeUrl,
    });
  }

  return renderAutamedicaEmail('AutaMedica', {
    variant: 'transactional',
    title: 'AutaMedica',
    paragraphs: ['Te compartimos una actualizacion de AutaMedica.'],
    action: { label: 'Abrir AutaMedica', url: actionUrl },
    unsubscribeUrl,
  });
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
  const actionUrl = stringFromData(data, 'action_url');
  const recipientName = firstName(job);

  let subject = 'AutaMedica';
  let title = `Hola, ${recipientName}`;
  let subtitle = '';
  let paragraphs: string[] = [];
  let ctaLabel = '';
  let ctaUrl = actionUrl;

  if (job.job_type === 'welcome') {
    const isDoctor = stringFromData(data, 'recipient_role') === 'doctor';
    subject = 'Bienvenido a AutaMedica';
    title = `Hola, ${recipientName}`;
    paragraphs = isDoctor
      ? [
          'Tu cuenta profesional en AutaMedica ya esta lista.',
          'Completa tu perfil y validacion profesional para preparar tu agenda, atender pacientes y emitir documentacion clinica desde un mismo lugar.',
        ]
      : [
          'Tu cuenta en AutaMedica ya esta lista.',
          'Completa tu anamnesis, ordena tu informacion clinica y prepara una consulta con mas contexto para el profesional.',
        ];
    ctaLabel = isDoctor ? 'Completar perfil profesional' : 'Completar anamnesis';
    ctaUrl = actionUrl || (isDoctor
      ? 'https://doctor.autamedica.com/doctors/perfil'
      : 'https://patients.autamedica.com/patients/anamnesis');
  } else if (job.job_type === 'anamnesis_reminder') {
    subject = 'AutaMedica · recordatorio';
    title = `Hola, ${recipientName}`;
    paragraphs = [
      'Te escribo para que puedas continuar el proceso que quedo pendiente.',
      'Completar tus datos antes de la consulta ayuda a que el medico entre con contexto, sin empezar desde cero.',
    ];
    ctaLabel = 'Continuar';
    ctaUrl = actionUrl || 'https://www.autamedica.com/patients/anamnesis';
  } else if (job.job_type === 'appointment_reminder') {
    const appointmentTime = stringFromData(data, 'appointment_time');
    subject = 'AutaMedica · recordatorio de consulta';
    title = `Hola, ${recipientName}`;
    paragraphs = [
      appointmentTime
        ? `Tu consulta esta agendada para el ${appointmentTime} hs.`
        : 'Tenes una consulta agendada en AutaMedica.',
      'Te dejamos el acceso a tu agenda para revisar el horario y entrar a la videoconsulta cuando corresponda.',
    ];
    ctaLabel = 'Ver consulta';
    ctaUrl = actionUrl || 'https://www.autamedica.com/patients/appointments';
  } else if (job.job_type === 'doctor_new_appointment') {
    const appointmentTime = stringFromData(data, 'appointment_time');
    const patientName = stringFromData(data, 'patient_name') || 'Un paciente';
    subject = 'AutaMedica · consulta pagada y confirmada';
    title = 'Consulta pagada y confirmada';
    paragraphs = [
      appointmentTime
        ? `${patientName} confirmo el pago de una consulta para el ${appointmentTime}.`
        : `${patientName} confirmo el pago de una consulta.`,
      'Ya podes revisar los detalles desde tu agenda medica.',
    ];
    ctaLabel = 'Ver agenda';
    ctaUrl = actionUrl || 'https://doctor.autamedica.com/doctors/appointments';
  } else if (job.job_type === 'doctor_appointment_cancelled') {
    const appointmentTime = stringFromData(data, 'appointment_time');
    const patientName = stringFromData(data, 'patient_name') || 'Un paciente';
    subject = 'AutaMedica · cita cancelada';
    title = `Hola, ${recipientName}`;
    paragraphs = [
      appointmentTime
        ? `${patientName} cancelo la consulta del ${appointmentTime} hs.`
        : `${patientName} cancelo una consulta.`,
      'Tu agenda ya refleja el cambio.',
    ];
    ctaLabel = 'Ver agenda';
    ctaUrl = actionUrl || 'https://doctor.autamedica.com/doctors/appointments';
  } else if (job.job_type === 'patient_appointment_cancelled') {
    const appointmentTime = stringFromData(data, 'appointment_time');
    const doctorName = stringFromData(data, 'doctor_name') || 'Tu medico';
    subject = 'AutaMedica · cita cancelada';
    title = `Hola, ${recipientName}`;
    paragraphs = [
      appointmentTime
        ? `${doctorName} cancelo la consulta del ${appointmentTime} hs.`
        : `${doctorName} cancelo una consulta.`,
      'Podes revisar tus turnos y agendar uno nuevo desde tu portal.',
    ];
    ctaLabel = 'Ver turnos';
    ctaUrl = actionUrl || 'https://www.autamedica.com/patients/appointments';
  } else if (job.job_type === 'doctor_anamnesis_ready') {
    const patientName = stringFromData(data, 'patient_name') || 'Un paciente';
    subject = 'AutaMedica · anamnesis disponible';
    title = `Hola, ${recipientName}`;
    paragraphs = [
      `${patientName} completo su anamnesis preconsulta.`,
      'Ya podes revisarla desde el panel medico.',
    ];
    ctaLabel = 'Ver paciente';
    ctaUrl = actionUrl || 'https://doctor.autamedica.com/doctors/patients';
  } else if (job.job_type === 'patient_prescription_ready') {
    const doctorName = stringFromData(data, 'doctor_name') || 'Tu medico';
    const pdfUrl = stringFromData(data, 'pdf_url');
    const medicationName = stringFromData(data, 'medication_name');
    const cuir = stringFromData(data, 'cuir');

    subject = 'AutaMedica Recetas · receta digital enviada con éxito';
    title = 'Receta digital enviada con éxito';
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
    paragraphs.push('Presentá la receta en la farmacia o guardala para tu seguimiento médico.');
    paragraphs.push('Seguí la indicación médica recibida. Si tenés dudas sobre el uso del medicamento, síntomas nuevos o una urgencia, consultá con un profesional de salud.');
    ctaLabel = pdfUrl ? 'Descargar receta' : 'Ver receta';
    ctaUrl = pdfUrl || actionUrl || 'https://www.autamedica.com/patients/prescriptions';
  } else if (job.job_type === 'patient_medical_order_ready') {
    const doctorName = stringFromData(data, 'doctor_name') || 'Tu medico';
    const pdfUrl = stringFromData(data, 'pdf_url');
    const practicesName = stringFromData(data, 'practices_name') || 'Orden de estudios médicos';
    const cuir = stringFromData(data, 'cuir');

    subject = 'AutaMedica · orden de estudios disponible';
    title = `Hola, ${recipientName}`;
    paragraphs = [
      `Dr. <strong>${doctorName}</strong> emitió una nueva orden de estudios complementarios para vos.`,
      'Ya está disponible en tu perfil para que puedas descargarla o utilizarla.',
    ];
    if (practicesName) {
      paragraphs.push(`<strong>Estudios solicitados:</strong> ${practicesName}.`);
    }
    if (cuir) {
      paragraphs.push(`<strong>Código de verificación:</strong> ${cuir}.`);
    }
    ctaLabel = pdfUrl ? 'Descargar PDF' : 'Ver orden';
    ctaUrl = pdfUrl || actionUrl || 'https://www.autamedica.com/patients/medical-orders';
  } else if (job.job_type === 'nurturing') {
    const templateKey = stringFromData(data, 'template_key');
    const actionUrl = stringFromData(data, 'action_url') || 'https://www.autamedica.com/patients/anamnesis';
    subject = 'AutaMedica';
    title = `Hola, ${recipientName}`;
    if (templateKey === 'science_backed') {
      subject = 'AutaMedica · la evidencia detras de tu salud';
      paragraphs = [
        'En AutaMedica nos basamos en la mejor evidencia cientifica disponible.',
        'Completar tu anamnesis nos ayuda a entender mejor tu historial y ofrecerte recomendaciones personalizadas.',
      ];
    } else if (templateKey === 'time_efficiency') {
      subject = 'AutaMedica · optimiza tu tiempo de consulta';
      paragraphs = [
        'Sabemos que tu tiempo es valioso.',
        'Al completar tu anamnesis con anticipacion, tu consulta medica es mucho mas eficiente y enfocada.',
      ];
    } else {
      paragraphs = [
        'Te invitamos a continuar con tu proceso en AutaMedica.',
        'Tus respuestas estan seguras y encriptadas bajo los mas altos estandares de privacidad.',
      ];
    }
    ctaLabel = 'Completar anamnesis';
    ctaUrl = actionUrl;
  } else if (job.job_type === 'community_new_topic') {
    const topicTitle = stringFromData(data, 'topic_title');
    const topicExcerpt = stringFromData(data, 'topic_excerpt');
    const authorName = stringFromData(data, 'author_name');
    const groupName = stringFromData(data, 'group_name');
    subject = `Nuevo tema en la comunidad: ${topicTitle}`;
    title = 'Nuevo tema en la comunidad';
    subtitle = `${authorName} creó un nuevo tema en el grupo ${groupName}.`;
    paragraphs = [
      `<strong>${authorName}</strong> creó un nuevo tema en el grupo <strong>${groupName}</strong>:`,
      `<strong>"${topicTitle}"</strong>`,
      `<em>"${topicExcerpt}"</em>`,
      'Ingresá a la plataforma para leer la publicación completa y participar de la conversación.'
    ];
    ctaLabel = 'Ver publicación';
    ctaUrl = actionUrl || 'https://www.autamedica.com';
  } else if (job.job_type === 'community_new_comment') {
    const topicTitle = stringFromData(data, 'topic_title');
    const commentExcerpt = stringFromData(data, 'comment_excerpt');
    const authorName = stringFromData(data, 'author_name');
    const groupName = stringFromData(data, 'group_name');
    subject = `Nuevo comentario en: ${topicTitle}`;
    title = 'Nuevo comentario en la comunidad';
    subtitle = `${authorName} comentó en el tema "${topicTitle}".`;
    paragraphs = [
      `<strong>${authorName}</strong> comentó en el tema <strong>"${topicTitle}"</strong> del grupo <strong>${groupName}</strong>:`,
      `<em>"${commentExcerpt}"</em>`,
      'Ingresá a la plataforma para leer el comentario completo y responder en el hilo.'
    ];
    ctaLabel = 'Ver comentario';
    ctaUrl = actionUrl || 'https://www.autamedica.com';
  } else if (job.job_type === 'newsletter') {
    subject = stringFromData(data, 'subject') || 'Novedades de AutaMedica';
    title = stringFromData(data, 'title') || 'Estimado/a Colega,';
    subtitle = stringFromData(data, 'subtitle') || '';
    const rawParagraphs = data.paragraphs;
    if (Array.isArray(rawParagraphs)) {
      paragraphs = rawParagraphs.map((p) => String(p));
    } else {
      paragraphs = ['Te compartimos novedades de AutaMedica.'];
    }
    ctaLabel = stringFromData(data, 'action_label') || 'Ver mas';
    ctaUrl = actionUrl || 'https://www.autamedica.com';
  } else {
    subject = stringFromData(data, 'subject') || 'AutaMedica';
    title = stringFromData(data, 'title') || `Hola, ${recipientName}`;
    paragraphs = ['Te compartimos una actualizacion de AutaMedica.'];
    ctaLabel = 'Abrir AutaMedica';
    ctaUrl = actionUrl || 'https://www.autamedica.com';
  }

  const bodyHtml = paragraphs
    .map((p) => `<p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 16px;">${p}</p>`)
    .join('');

  return {
    subject,
    title,
    subtitle,
    body_html: bodyHtml,
    cta_url: ctaUrl,
    cta_label: ctaLabel,
    secondary_url: ctaUrl,
    secondary_label: 'Si el boton no abre, copia este enlace:',
    signature_name: 'AutaMedica',
  };
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

async function sendViaBrevo(
  runtimeEnv: RuntimeEnv,
  job: EmailJob,
  subject: string,
  params: Record<string, string>,
): Promise<string> {
  const apiKey = readEnv(runtimeEnv, 'BREVO_API_KEY');
  if (!apiKey) throw new Error('BREVO_API_KEY no configurada');

  const fromEmail = readEnv(runtimeEnv, 'FROM_EMAIL') || AUTAMEDICA_FROM.email;
  const fromName = readEnv(runtimeEnv, 'FROM_NAME') || AUTAMEDICA_FROM.name;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: job.recipient_email, name: job.recipient_name || job.recipient_email }],
      templateId: 8,
      subject,
      params,
      tags: ['transactional', 'autamedica', job.job_type],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Brevo SMTP ${response.status}: ${body}`);
  }

  const parsed = JSON.parse(body) as { messageId?: string };
  return parsed.messageId ?? '';
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

async function markSent(
  admin: AdminClient,
  jobId: string,
  providerMessageId: string,
  provider: 'resend' | 'brevo' = 'resend',
): Promise<void> {
  const { error } = await (admin as any)
    .schema('growth_os')
    .from('email_jobs')
    .update({
      status: 'sent',
      provider,
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

      const apiKey = readEnv(runtimeEnv, 'BREVO_API_KEY');
      if (apiKey) {
        const params = getBrevoParamsForJob(job);
        const providerMessageId = await sendViaBrevo(runtimeEnv, job, params.subject, params);
        await markSent(admin, job.id, providerMessageId, 'brevo');
        results.push({ id: job.id, job_type: job.job_type, status: 'sent' });
      } else {
        const rendered = renderJob(job);
        const providerMessageId = await sendViaResend(runtimeEnv, job, rendered);
        await markSent(admin, job.id, providerMessageId, 'resend');
        results.push({ id: job.id, job_type: job.job_type, status: 'sent' });
      }
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
