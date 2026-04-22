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
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const AUTAMEDICA_FROM = {
  email: 'contacto@autamedica.com',
  name: 'Eduardo Marques',
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
    'Eduardo Marques',
    'Fundador · AutaMedica',
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
    .email-container { max-width: 600px; margin: 40px auto; background-color: #FFFFFF; border-radius: 28px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 20px 40px rgba(15,23,42,0.06); }
    .content { padding: 44px 46px 42px; line-height: 1.62; }
    h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 30px; line-height: 1.18; font-weight: 700; color: #020617; margin: 0 0 22px; letter-spacing: 0; }
    p { font-size: 16px; margin: 0 0 18px; color: #475569; }
    strong { color: #111827; }
    .note { background-color: #F8FAFC; padding: 22px; border-radius: 18px; margin: 30px 0 0; border-left: 4px solid #00A3FF; }
    .button { background-color: #020617; color: #FFFFFF !important; padding: 15px 30px; text-decoration: none; border-radius: 9999px; font-weight: 700; display: inline-block; font-size: 15px; }
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
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td
          background="${escapeHtml(gifUrl)}"
          bgcolor="#EAF6FF"
          width="600"
          height="220"
          style="background-image:url('${escapeHtml(gifUrl)}');background-repeat:no-repeat;background-position:center;background-size:cover;height:220px;border-bottom:1px solid #F1F5F9;"
        ></td>
      </tr>
    </table>

    <div class="content">
      <h1>${escapeHtml(input.title)}</h1>
      ${input.intro ? `<p>${escapeHtml(input.intro)}</p>` : ''}
      ${paragraphHtml(input.paragraphs)}
      ${input.note ? `<div class="note"><p style="margin:0;">${escapeHtml(input.note)}</p></div>` : ''}
      ${actionHtml}
      ${secondaryHtml}

      <div style="margin-top:38px;">
        <p style="margin:0 0 4px;color:#475569;">Saludos,</p>
        <p style="margin:0;color:#111827;"><strong>Eduardo Marques</strong><br>Fundador · AutaMedica</p>
      </div>
    </div>

    <div class="footer">
      <p style="font-size:13px;margin:0 0 10px;">AutaMedica · contacto@autamedica.com</p>
      <p style="font-size:12px;margin:0 0 18px;">${escapeHtml(input.footerText ?? 'Tecnologia para que la consulta empiece con mejor informacion.')}</p>
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

export function buildWelcomeEmail(firstName: string, actionUrl: string, unsubscribeUrl?: string): RenderedEmail {
  return renderAutamedicaEmail('Bienvenido a AutaMedica', {
    variant: 'welcome',
    title: `Hola, ${firstName || 'como estas'}`,
    preheader: 'Tu cuenta en AutaMedica ya esta lista.',
    paragraphs: [
      'Tu cuenta en AutaMedica ya esta lista.',
      'Desde aca podes completar tu anamnesis, ordenar tu informacion clinica y preparar una consulta con mas contexto para el profesional.',
    ],
    action: { label: 'Completar anamnesis', url: actionUrl },
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

