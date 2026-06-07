export type AutamedicaEmailVariant = 'welcome' | 'reminder' | 'newsletter' | 'transactional';

export interface AutamedicaEmailAction {
  label: string;
  url: string;
}

export interface AutamedicaEmailTemplateInput {
  title: string;
  preheader?: string;
  intro?: string;
  paragraphs: string[];
  note?: string;
  action?: AutamedicaEmailAction;
  secondaryLink?: AutamedicaEmailAction;
  footerText?: string;
  unsubscribeUrl?: string;
  variant?: AutamedicaEmailVariant;
  gifUrl?: string;
  closingName?: string;
  closingRole?: string;
  showPersonalSignature?: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const AUTAMEDICA_FROM = {
  email: 'contacto@autamedica.com',
  name: 'AutaMedica',
} as const;

export const AUTAMEDICA_BRAND_GIF_URL =
  'https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/public/public_assets/autamedica-reference-style.gif';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function paragraphHtml(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
}

function textFromInput(input: AutamedicaEmailTemplateInput): string {
  const lines = [
    input.title,
    '',
    input.intro,
    ...input.paragraphs,
    input.note,
    input.action ? `${input.action.label}: ${input.action.url}` : '',
    input.secondaryLink ? `${input.secondaryLink.label}: ${input.secondaryLink.url}` : '',
    '',
    input.showPersonalSignature === false ? '' : input.closingName ?? 'Equipo AutaMedica',
    input.showPersonalSignature === false ? '' : input.closingRole ?? 'AutaMedica',
    'contacto@autamedica.com',
  ].filter(Boolean);

  if (input.unsubscribeUrl) {
    lines.push('', `Darse de baja: ${input.unsubscribeUrl}`);
  }

  return lines.join('\n\n');
}

export function renderAutamedicaEmail(
  subject: string,
  input: AutamedicaEmailTemplateInput,
): RenderedEmail {
  const gifUrl = input.gifUrl ?? AUTAMEDICA_BRAND_GIF_URL;
  const preheader = input.preheader ?? input.title;
  const actionHtml = input.action
    ? `
      <div style="text-align:center;margin-top:38px;">
        <a href="${escapeHtml(input.action.url)}" class="button">${escapeHtml(input.action.label)}</a>
      </div>
      <p style="font-size:13px;color:#64748B;text-align:center;margin-top:18px;">
        Si el boton no abre, copia este enlace:<br>
        <a href="${escapeHtml(input.action.url)}" style="color:#0F172A;word-break:break-word;">${escapeHtml(input.action.url)}</a>
      </p>
    `
    : '';
  const secondaryHtml = input.secondaryLink
    ? `<p style="font-size:14px;color:#64748B;margin-top:18px;"><a href="${escapeHtml(input.secondaryLink.url)}" style="color:#0F172A;">${escapeHtml(input.secondaryLink.label)}</a></p>`
    : '';
  const unsubscribeHtml = input.unsubscribeUrl
    ? `<a href="${escapeHtml(input.unsubscribeUrl)}" style="font-size:12px;">Darse de baja</a>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0F172A; }
    .email-container { max-width: 640px; margin: 40px auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 20px 40px rgba(15,23,42,0.06); }
    .brand-header { background: linear-gradient(135deg,#143B5A,#2876A4); padding: 40px 40px 28px; text-align: center; }
    .brand-header img { display: block; width: 225px; max-width: 70%; height: auto; border: 0; outline: none; text-decoration: none; margin: 0 auto 24px; background: #FFFFFF; }
    .brand-kicker { color: #DDEAF4; font-size: 15px; line-height: 1.2; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 500; }
    .content { padding: 44px 46px 42px; line-height: 1.62; }
    h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 26px; line-height: 1.2; font-weight: 700; color: #0F2B46; margin: 0 0 22px; letter-spacing: 0; }
    p { font-size: 16px; margin: 0 0 18px; color: #475569; }
    strong { color: #111827; }
    .note { background-color: #F8FAFC; padding: 22px; border-radius: 18px; margin: 30px 0 0; border-left: 4px solid #00A3FF; }
    .button { background-color: #1B4F72; color: #FFFFFF !important; padding: 13px 26px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; font-size: 15px; }
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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <div class="email-container">
    <div class="brand-header">
      <img src="${escapeHtml(gifUrl)}" alt="AutaMedica">
      <div class="brand-kicker">Telemedicina para LATAM</div>
    </div>

    <div class="content">
      <h1>${escapeHtml(input.title)}</h1>
      ${input.intro ? `<p>${escapeHtml(input.intro)}</p>` : ''}
      ${paragraphHtml(input.paragraphs)}
      ${input.note ? `<div class="note"><p style="margin:0;">${escapeHtml(input.note)}</p></div>` : ''}
      ${actionHtml}
      ${secondaryHtml}

      ${
        input.showPersonalSignature === false
          ? ''
          : `<div style="margin-top:38px;">
        <p style="margin:0 0 4px;color:#475569;">Saludos,</p>
        <p style="margin:0;color:#111827;"><strong>${escapeHtml(input.closingName ?? 'Equipo AutaMedica')}</strong><br>${escapeHtml(input.closingRole ?? 'AutaMedica')}</p>
      </div>`
      }
    </div>

    <div class="footer">
      <p style="font-size:13px;margin:0 0 10px;">AutaMedica · <a href="mailto:contacto@autamedica.com" style="text-decoration:none;">contacto@autamedica.com</a> · <a href="https://wa.me/5491168261552" style="text-decoration:none;font-weight:700;">WhatsApp</a></p>
      <p style="font-size:12px;margin:0 0 18px;">${escapeHtml(input.footerText ?? 'Salud digital, continuidad de cuidado y tecnologia clinica.')}</p>
      ${unsubscribeHtml}
    </div>
  </div>
</body>
</html>`;

  return {
    subject,
    html,
    text: textFromInput(input),
  };
}

export function buildWelcomeEmail(
  firstName: string,
  actionUrl: string,
  unsubscribeUrl?: string,
  recipientRole: 'patient' | 'doctor' = 'patient',
): RenderedEmail {
  const isDoctor = recipientRole === 'doctor';

  return renderAutamedicaEmail('Bienvenido a AutaMedica', {
    variant: 'welcome',
    title: `Hola, ${firstName || 'como estas'}`,
    preheader: 'Tu cuenta en AutaMedica ya esta lista.',
    paragraphs: isDoctor
      ? [
          'Tu cuenta profesional en AutaMedica ya esta lista.',
          'Completa tu perfil y validacion profesional para preparar tu agenda, atender pacientes y emitir documentacion clinica desde un mismo lugar.',
        ]
      : [
          'Tu cuenta en AutaMedica ya esta lista.',
          'Completa tu anamnesis, ordena tu informacion clinica y prepara una consulta con mas contexto para el profesional.',
        ],
    action: {
      label: isDoctor ? 'Completar perfil profesional' : 'Completar anamnesis',
      url: actionUrl,
    },
    unsubscribeUrl,
  });
}

export function buildReminderEmail(firstName: string, actionUrl: string, unsubscribeUrl?: string): RenderedEmail {
  return renderAutamedicaEmail('AutaMedica · recordatorio', {
    variant: 'reminder',
    title: `Hola, ${firstName || 'como estas'}`,
    preheader: 'Te dejamos el enlace para continuar tu proceso en AutaMedica.',
    paragraphs: [
      'Te escribo para que puedas continuar el proceso que quedo pendiente.',
      'Completar tus datos antes de la consulta ayuda a que el medico entre con contexto, sin empezar desde cero.',
    ],
    action: { label: 'Continuar', url: actionUrl },
    unsubscribeUrl,
  });
}

export function buildNewsletterEmail(
  subject: string,
  title: string,
  paragraphs: string[],
  unsubscribeUrl: string,
): RenderedEmail {
  return renderAutamedicaEmail(subject, {
    variant: 'newsletter',
    title,
    paragraphs,
    unsubscribeUrl,
    footerText: 'Salud digital, continuidad de cuidado y tecnologia clinica.',
  });
}

// ─── Nurturing Templates ──────────────────────────────────────

type NurturingContent = {
  subject: string;
  title: string;
  paragraphs: string[];
  actionLabel: string;
};

const NURTURING_TEMPLATES: Record<string, NurturingContent> = {
  nurturing_value_1: {
    subject: 'Tu historia clinica empieza antes de la consulta',
    title: 'La consulta empieza antes de sentarte frente al medico',
    paragraphs: [
      'La mayoria de los pacientes llegan a la consulta sin informacion previa: ni antecedentes, ni habitos de sueno, ni medicacion actual.',
      'AutaMedica te permite completar tu historia clinica antes, para que el profesional entre con contexto real y no empiece de cero.',
      'Cuanta mas informacion trae el paciente, mejor es la consulta. No es una opinion: es evidencia.',
    ],
    actionLabel: 'Completar mi historia clinica',
  },
  nurturing_value_2: {
    subject: 'Que registra AutaMedica que otros sistemas no capturan',
    title: 'Lo que se pierde cuando no hay datos previos',
    paragraphs: [
      'Un turno de 15 minutos no alcanza para explorar sueno, entorno, alimentacion y antecedentes. Pero esa informacion importa.',
      'AutaMedica captura esos datos antes de la consulta, en tu tiempo, y los organiza para que el profesional los tenga listos.',
      'No reemplaza al medico. Complementa la consulta con lo que no se alcanza a preguntar.',
    ],
    actionLabel: 'Ver como funciona',
  },
  nurturing_cta: {
    subject: 'Tu proximo paso: agendar tu primera consulta',
    title: 'Cuando estes listo, el turno esta aca',
    paragraphs: [
      'Ya tenes tu cuenta. El siguiente paso es agendar tu primera consulta medica.',
      'Si completaste tu anamnesis, el profesional va a entrar a la consulta con tu informacion. Si no, todavia estas a tiempo.',
    ],
    actionLabel: 'Agendar consulta',
  },
  nurturing_tdah_1: {
    subject: 'TDAH en adultos: lo que la evaluacion online puede detectar',
    title: 'TDAH en adultos: no siempre es lo que parece',
    paragraphs: [
      'Muchos adultos con TDAH no fueron diagnosticados en la infancia. Los sintomas se confunden con estres, ansiedad o falta de organizacion.',
      'Una evaluacion estructurada puede identificar patrones que en una consulta general se pasan por alto.',
      'En AutaMedica, la evaluacion empieza antes de la consulta: un cuestionario clinico validado que el profesional revisa con anticipacion.',
    ],
    actionLabel: 'Empezar evaluacion TDAH',
  },
  nurturing_tdah_2: {
    subject: 'Como funciona la evaluacion clinica en AutaMedica',
    title: 'Como funciona una evaluacion TDAH en AutaMedica',
    paragraphs: [
      'Completas un cuestionario clinico estructurado desde tu casa, sin apuro.',
      'Un profesional especializado revisa tus respuestas antes de la consulta.',
      'La videoconsulta arranca con contexto: no perdes tiempo repitiendo lo basico.',
    ],
    actionLabel: 'Agendar evaluacion',
  },
  nurturing_cta_tdah: {
    subject: 'Agenda tu evaluacion TDAH',
    title: 'Tu evaluacion esta lista para agendarse',
    paragraphs: [
      'Si sentis que la desatencion, la impulsividad o la dificultad para sostener tareas te afectan en el dia a dia, una evaluacion profesional puede darte claridad.',
      'No es un test online generico. Es una consulta clinica con un profesional que ya reviso tu caso.',
    ],
    actionLabel: 'Agendar ahora',
  },
  nurturing_insomnio_1: {
    subject: 'Insomnio cronico: por que la historia clinica importa',
    title: 'Insomnio cronico: el problema no es solo dormir mal',
    paragraphs: [
      'El insomnio cronico afecta concentracion, humor, metabolismo y salud cardiovascular. Pero rara vez se evalua con la profundidad necesaria.',
      'La mayoria de las consultas por insomnio duran 10 minutos. No alcanza para explorar habitos de sueno, medicacion, estres y entorno.',
      'AutaMedica registra esos datos antes de que entres a la consulta. El profesional ve tu patron de sueno, no solo tu queja.',
    ],
    actionLabel: 'Registrar mi patron de sueno',
  },
  nurturing_insomnio_2: {
    subject: 'Que esperar de tu consulta de sueno en AutaMedica',
    title: 'Tu consulta de sueno, con contexto',
    paragraphs: [
      'Antes de la consulta, completas un registro de sueno y habitos. No es un formulario generico: esta disenado para que el profesional identifique patrones.',
      'En la videoconsulta, el medico ya sabe cuantas horas dormis, que te despierta y que probaste antes.',
      'Ese contexto previo cambia la calidad de la consulta.',
    ],
    actionLabel: 'Agendar consulta de sueno',
  },
  nurturing_cta_insomnio: {
    subject: 'Agenda tu consulta de sueno',
    title: 'Dormir mejor empieza con una consulta informada',
    paragraphs: [
      'Si llevas semanas o meses durmiendo mal, una consulta con contexto clinico real puede hacer la diferencia.',
      'En AutaMedica la consulta no empieza con "¿que le pasa?". Empieza con datos.',
    ],
    actionLabel: 'Agendar consulta',
  },
};

export function buildNurturingEmail(
  templateKey: string,
  recipientName: string,
  actionUrl: string,
  unsubscribeUrl?: string,
): RenderedEmail {
  const content = NURTURING_TEMPLATES[templateKey];
  if (!content) {
    return buildReminderEmail(recipientName, actionUrl, unsubscribeUrl);
  }

  return renderAutamedicaEmail(content.subject, {
    variant: 'transactional',
    title: content.title,
    preheader: content.paragraphs[0] ?? content.title,
    paragraphs: content.paragraphs,
    action: { label: content.actionLabel, url: actionUrl },
    unsubscribeUrl,
  });
}

export function buildDoctorPrescriptionBenefitsEmail(
  doctorName: string,
  actionUrl: string,
  unsubscribeUrl?: string,
): RenderedEmail {
  return renderAutamedicaEmail('AutaMedica · Recetas Clínicas con Guía de Acompañamiento', {
    variant: 'newsletter',
    title: `Estimado/a Dr./Dra. ${doctorName || 'Colega'}`,
    preheader: 'Optimice su práctica con recetas electrónicas que sus pacientes sí comprenden.',
    paragraphs: [
      'Optimice su práctica con nuestro módulo de Receta Digital (Ley 27.553). La plataforma genera automáticamente una Guía de Acompañamiento para el paciente, la cual podrá ser modificada a su criterio antes de emitir la receta si posee una visión clínica diferente.',
    ],
    action: { label: 'Ingresar a mi Portal Médico', url: actionUrl },
    unsubscribeUrl,
  });
}

export function buildPatientPrescriptionBenefitsEmail(
  patientName: string,
  actionUrl: string,
  unsubscribeUrl?: string,
): RenderedEmail {
  return renderAutamedicaEmail('Tus Recetas Digitales con Guía de Acompañamiento', {
    variant: 'newsletter',
    title: `Hola, ${patientName || 'cómo estás'}`,
    preheader: 'Tus recetas electrónicas en AutaMedica con guía de acompañamiento personalizada.',
    paragraphs: [
      'En AutaMedica tus recetas digitales son 100% válidas en todo el país. Recibe tu receta electrónica con una Guía de Acompañamiento médica directo en tu celular. Gestiona tus tratamientos con total claridad y seguridad desde tu portal de salud.',
    ],
    action: { label: 'Ver mis Recetas Digitales', url: actionUrl },
    unsubscribeUrl,
  });
}
