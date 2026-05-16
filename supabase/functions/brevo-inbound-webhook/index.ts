import { corsHeaders } from '../_shared/cors.ts'

/**
 * Edge Function: brevo-inbound-webhook
 * 
 * Recibe emails parseados por Brevo Inbound Parsing y envía un auto-reply
 * profesional al remitente original.
 * 
 * Brevo POST payload:
 * {
 *   "items": [{
 *     "Uuid": ["..."],
 *     "MessageId": "...",
 *     "InReplyTo": "...",
 *     "From": { "Name": "...", "Address": "..." },
 *     "To": [{ "Name": "...", "Address": "..." }],
 *     "Subject": "...",
 *     "RawHtmlBody": "...",
 *     "RawTextBody": "...",
 *     "SentAtDate": "..."
 *   }]
 * }
 */

// Emails que NO deben recibir auto-reply (evitar loops)
const NO_REPLY_ADDRESSES = new Set([
  'contacto@autamedica.com',
  'noreply@autamedica.com',
  'no-reply@autamedica.com',
  'autamedica@gmail.com',
  'mailer-daemon@',
  'noreply@',
  'no-reply@',
])

const NO_REPLY_DOMAINS = new Set([
  'autamedica.com',        // No responder a nosotros mismos
  'sendinblue.com',        // No responder a Brevo
  'brevo.com',
  'googleusercontent.com',
  'getsentry.com',
  'github.com',
])

function shouldAutoReply(email: string): boolean {
  const lower = email.toLowerCase()
  if (NO_REPLY_ADDRESSES.has(lower)) return false
  
  const domain = lower.split('@')[1] ?? ''
  if (NO_REPLY_DOMAINS.has(domain)) return false
  
  // No responder a emails con "noreply", "no-reply", "mailer-daemon"
  const localPart = lower.split('@')[0] ?? ''
  if (['noreply', 'no-reply', 'mailer-daemon', 'postmaster', 'bounce'].some(p => localPart.includes(p))) {
    return false
  }
  
  return true
}

async function sendAutoReply(to: string, toName: string): Promise<{ ok: boolean; error?: string }> {
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoKey) return { ok: false, error: 'No BREVO_API_KEY' }

  const displayName = toName || 'Usuario'

  const bodyHtml = `
<p>Hola${toName ? ` <strong>${toName}</strong>` : ''},</p>

<p>Recibimos tu mensaje correctamente. Nuestro equipo lo está revisando y te responderemos a la brevedad, generalmente dentro de las próximas <strong>24 horas hábiles</strong>.</p>

<p>Mientras tanto, te recordamos que podés resolver muchas consultas directamente desde la plataforma:</p>
<ul>
  <li><strong>Pacientes:</strong> Agendá turnos, descargá recetas y consultá tu historia clínica desde el portal.</li>
  <li><strong>Médicos:</strong> Accedé a tu agenda, emití recetas y gestioná tus pacientes desde el portal profesional.</li>
</ul>

<p>Si tu consulta es urgente, podés escribirnos por WhatsApp al número que figura en nuestra web.</p>
`

  const payload = {
    sender: { name: 'AutaMedica', email: 'contacto@autamedica.com' },
    replyTo: { name: 'AutaMedica', email: 'contacto@autamedica.com' },
    to: [{ email: to, name: toName || to }],
    templateId: 8,
    params: {
      subject: 'Recibimos tu mensaje — AutaMedica',
      title: 'Tu consulta fue recibida',
      body_html: bodyHtml,
      cta_url: 'https://www.autamedica.com',
      cta_label: 'Ir a AutaMedica',
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
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error(`Brevo error ${res.status}:`, data)
      return { ok: false, error: JSON.stringify(data) }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const items = body.items ?? [body]
    
    let processed = 0
    let skipped = 0

    for (const item of items) {
      const from = item.From ?? item.from ?? {}
      const senderEmail = (from.Address ?? from.address ?? '').toLowerCase()
      const senderName = from.Name ?? from.name ?? ''
      const subject = item.Subject ?? item.subject ?? ''

      console.info(`[brevo-inbound] Email from: ${senderEmail} | Subject: ${subject}`)

      // Verificar si debemos responder
      if (!senderEmail || !shouldAutoReply(senderEmail)) {
        console.info(`[brevo-inbound] Skipped auto-reply for: ${senderEmail}`)
        skipped++
        continue
      }

      // Enviar auto-reply
      const result = await sendAutoReply(senderEmail, senderName)
      if (result.ok) {
        console.info(`[brevo-inbound] ✅ Auto-reply sent to ${senderEmail}`)
        processed++
      } else {
        console.error(`[brevo-inbound] ❌ Failed for ${senderEmail}: ${result.error}`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, skipped }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[brevo-inbound] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
