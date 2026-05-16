import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * Edge Function: welcome-email
 * 
 * Se dispara automáticamente cuando se crea un nuevo perfil en la tabla `profiles`.
 * Envía un correo de bienvenida personalizado según el rol (paciente o médico)
 * usando la API de Brevo con el template institucional #8.
 * 
 * Trigger: Database webhook on INSERT en `profiles`
 * Fallback: Puede llamarse manualmente con POST { userId, role, email, firstName }
 */

interface ProfileRecord {
  user_id: string
  email: string | null
  role: string | null
  first_name: string | null
  last_name: string | null
}

interface WebhookPayload {
  type: 'INSERT'
  table: string
  record: ProfileRecord
  schema: string
}

// ── Templates de bienvenida ───────────────────────────────────────────────

const PATIENT_WELCOME = {
  subject: 'Bienvenido/a a AutaMedica',
  title: 'Tu salud, ahora digital',
  body: (name: string) => `
<p>Hola <strong>${name}</strong>,</p>

<p>Te damos la bienvenida a <strong>AutaMedica</strong>, tu plataforma de telemedicina y receta electrónica.</p>

<p><strong>¿Qué podés hacer desde hoy?</strong></p>
<ul>
  <li><strong>Consultas por videollamada:</strong> Conectá con médicos verificados desde tu casa, sin esperas.</li>
  <li><strong>Receta Electrónica Nacional:</strong> Recibí tus recetas en el celular y retirá la medicación en cualquier farmacia del país sin imprimir nada.</li>
  <li><strong>Historia Clínica Digital:</strong> Tus antecedentes, estudios y recetas, todo en un solo lugar seguro.</li>
</ul>

<p>Tu próximo paso: completá tu perfil de salud para que los profesionales puedan atenderte más rápido.</p>
`,
  cta_url: 'https://www.autamedica.com/patients/profile',
  cta_label: 'Completar mi perfil',
}

const DOCTOR_WELCOME = {
  subject: 'Bienvenido/a al Portal Médico de AutaMedica',
  title: 'Tu consultorio digital está listo',
  body: (name: string) => `
<p>Hola <strong>Dr/a. ${name}</strong>,</p>

<p>Te damos la bienvenida al portal profesional de <strong>AutaMedica</strong>.</p>

<p><strong>Para habilitar tu perfil necesitamos:</strong></p>
<ul>
  <li><strong>Matrícula profesional:</strong> Subí una foto legible de tu matrícula nacional o provincial.</li>
  <li><strong>Documento de identidad:</strong> DNI frente y dorso para verificación.</li>
  <li><strong>Foto profesional:</strong> Para tu perfil público en el directorio de profesionales.</li>
</ul>

<p>Una vez verificado, vas a poder:</p>
<ul>
  <li>Atender pacientes por videoconsulta.</li>
  <li>Emitir recetas electrónicas con validez nacional.</li>
  <li>Gestionar tu agenda y cobrar por cada consulta.</li>
</ul>
`,
  cta_url: 'https://www.autamedica.com/auth/login?role=doctor&portal=doctors&returnTo=https%3A%2F%2Fdoctor.autamedica.com%2F',
  cta_label: 'Completar mi verificación',
}

// ── Auto-reply para emails entrantes ──────────────────────────────────────

const AUTO_REPLY = {
  subject: 'Recibimos tu mensaje — AutaMedica',
  title: 'Tu consulta fue recibida',
  body: (name: string) => `
<p>Hola${name ? ` <strong>${name}</strong>` : ''},</p>

<p>Recibimos tu mensaje correctamente. Nuestro equipo lo está revisando y te responderemos a la brevedad, generalmente dentro de las próximas <strong>24 horas hábiles</strong>.</p>

<p>Mientras tanto, te recordamos que podés resolver muchas consultas directamente desde la plataforma:</p>
<ul>
  <li><strong>Pacientes:</strong> Agendá turnos, descargá recetas y consultá tu historia clínica desde el portal.</li>
  <li><strong>Médicos:</strong> Accedé a tu agenda, emití recetas y gestioná tus pacientes desde el portal profesional.</li>
</ul>

<p>Si tu consulta es urgente, podés escribirnos por WhatsApp al número que figura en nuestra web.</p>
`,
  cta_url: 'https://www.autamedica.com',
  cta_label: 'Ir a AutaMedica',
}

// ── Envío via Brevo ───────────────────────────────────────────────────────

async function sendBrevoEmail(params: {
  to: string
  toName: string
  subject: string
  title: string
  bodyHtml: string
  ctaUrl: string
  ctaLabel: string
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoKey) {
    console.error('BREVO_API_KEY not configured')
    return { ok: false, error: 'BREVO_API_KEY not configured' }
  }

  const payload = {
    sender: { name: 'AutaMedica', email: 'contacto@autamedica.com' },
    replyTo: { name: 'AutaMedica', email: 'contacto@autamedica.com' },
    to: [{ email: params.to, name: params.toName }],
    templateId: 8,
    params: {
      subject: params.subject,
      title: params.title,
      body_html: params.bodyHtml,
      cta_url: params.ctaUrl,
      cta_label: params.ctaLabel,
      secondary_url: 'mailto:contacto@autamedica.com',
      secondary_label: 'contacto@autamedica.com',
      signature_name: 'Equipo AutaMedica',
    },
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error(`Brevo error ${res.status}:`, data)
      return { ok: false, error: JSON.stringify(data) }
    }
    return { ok: true, data }
  } catch (err) {
    console.error('Brevo fetch error:', err)
    return { ok: false, error: String(err) }
  }
}

// ── Handler principal ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // Determinar si es un webhook de DB o una llamada manual
    const isDbWebhook = body.type === 'INSERT' && body.table === 'profiles'
    
    let email: string
    let role: string
    let firstName: string
    let lastName: string
    let mode: 'welcome' | 'auto-reply'

    if (isDbWebhook) {
      // Trigger automático de la DB
      const record = (body as WebhookPayload).record
      email = record.email ?? ''
      role = record.role ?? 'patient'
      firstName = record.first_name ?? ''
      lastName = record.last_name ?? ''
      mode = 'welcome'
      console.info(`[welcome-email] DB trigger: new ${role} — ${email}`)
    } else if (body.mode === 'auto-reply') {
      // Auto-reply a email entrante
      email = body.email ?? ''
      firstName = body.name ?? ''
      lastName = ''
      role = ''
      mode = 'auto-reply'
      console.info(`[welcome-email] Auto-reply mode — ${email}`)
    } else {
      // Llamada manual
      email = body.email ?? ''
      role = body.role ?? 'patient'
      firstName = body.firstName ?? body.first_name ?? ''
      lastName = body.lastName ?? body.last_name ?? ''
      mode = 'welcome'
      console.info(`[welcome-email] Manual call: ${role} — ${email}`)
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Excluir cuentas de test/demo
    const excludedDomains = ['invisible.email', 'example.com', 'example.invalid']
    const excludedEmails = [
      'doctor.demo@autamedica.com',
      'patient.demo@autamedica.com',
      'farmacia.demo@autamedica.com',
    ]
    const domain = email.split('@')[1] ?? ''
    if (excludedDomains.includes(domain) || excludedEmails.includes(email.toLowerCase())) {
      console.info(`[welcome-email] Skipped test/demo email: ${email}`)
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'test_account' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Seleccionar template
    let template: typeof PATIENT_WELCOME | typeof AUTO_REPLY
    const displayName = firstName || 'Usuario'

    if (mode === 'auto-reply') {
      template = AUTO_REPLY
    } else if (role === 'doctor') {
      template = DOCTOR_WELCOME
    } else {
      template = PATIENT_WELCOME
    }

    const result = await sendBrevoEmail({
      to: email,
      toName: `${firstName} ${lastName}`.trim() || email,
      subject: template.subject,
      title: template.title,
      bodyHtml: template.body(displayName),
      ctaUrl: template.cta_url,
      ctaLabel: template.cta_label,
    })

    if (!result.ok) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.info(`[welcome-email] ✅ Sent ${mode} email to ${email}`)

    return new Response(
      JSON.stringify({ success: true, mode, email, provider: 'brevo' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[welcome-email] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
