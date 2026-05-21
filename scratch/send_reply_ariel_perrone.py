import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

GMAIL_USER = "autamedica@gmail.com"
GMAIL_APP_PASSWORD = "cmcq pmwa xanv zekl"
FROM = "Eduardo Marques - AutaMedica <contacto@autamedica.com>"
TO = "ariel.perrone@ama-med.org.ar"
SUBJECT = "Re: Salud digital · a disposición de la AMA"

GIF = "https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/public/public_assets/autamedica-reference-style.gif"
WA_LINK = "https://wa.me/5491166599559?text=Hola%20Ariel%2C%20conversamos%20sobre%20salud%20digital"

TEMPLATE = """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{subject}</title></head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:'Inter',-apple-system,sans-serif;color:#334155;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fa;padding:24px 12px;">
<tr><td style="background:linear-gradient(135deg,#143B5A,#2876A4);padding:40px 40px 28px;text-align:center;">
<img src="{gif}" alt="AutaMedica" style="display:block;width:225px;max-width:70%;height:auto;border:0;margin:0 auto 24px;background:#fff;">
<div style="color:#DDEAF4;font-size:15px;letter-spacing:1.2px;text-transform:uppercase;font-weight:500;">Telemedicina para LATAM</div></td></tr>
<tr><td style="padding:32px 40px 8px;"><h1 style="font-family:Georgia,serif;color:#0F2B46;font-size:24px;font-weight:700;margin:0;">{title}</h1>
<p style="margin:12px 0 0;color:#64748B;font-size:15px;line-height:1.6;">{subtitle}</p></td></tr>
<tr><td style="padding:16px 40px 24px;color:#334155;font-size:15px;line-height:1.7;">{body}</td></tr>
<tr><td style="padding:0 40px 32px;">
<a href="{cta_url}" style="display:inline-block;background:#1B4F72;color:#ffffff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">{cta_label}</a>
<a href="mailto:contacto@autamedica.com" style="display:inline-block;margin-left:10px;border:1.5px solid #1B4F72;color:#1B4F72;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">contacto@autamedica.com</a></td></tr>
<tr><td style="border-top:1px solid #E2E8F0;padding:24px 40px 28px;color:#94A3B8;font-size:12px;line-height:1.6;">
<p style="font-size:12px;color:#0F2B46;font-weight:700;margin:0 0 4px;">Fundador: Eduardo Marques</p>
<p style="margin:0 0 4px;">AutaMedica</p>
<p style="margin:0 0 4px;">Reg. MSAL: RL-2026-47574120-APN-SSVEIYES#MS | ID: 0268</p>
<p style="margin:0 0 12px;">HL7 FHIR · ReNaPDiS Recetario Electrónico</p>
<p style="margin:0 0 4px;"><a href="mailto:contacto@autamedica.com" style="color:#2471A3;text-decoration:none;font-weight:700;">contacto@autamedica.com</a> · <a href="https://autamedica.com" style="color:#2471A3;text-decoration:none;font-weight:700;">autamedica.com</a></p>
<p style="margin:14px 0 0;font-size:11px;color:#64748B;text-align:center;">© 2026 AutaMedica — Telemedicina hecha para LATAM</p>
</table></td></tr></table></body></html>"""

body_html = """
<p>Hola Ariel, buen día.</p>
<p>Muchas gracias por tu respuesta y por el feedback. Me alegro de que la AMA ya tenga un ecosistema digital en marcha; es fundamental para la transformación de nuestro sector.</p>
<p>Simplemente quería ponerme a disposición no solo para proveer software de cara al paciente, sino para colaborar en <strong>integraciones específicas</strong> (por ejemplo, interoperabilidad de nuestro validador de receta electrónica y módulos de IA en sus apps existentes) o bien para coordinar alguna charla/taller sobre la implementación de la <strong>Ley de Receta Digital (Ley 27.553)</strong> y el uso ético de la IA en la práctica clínica para los socios de la asociación.</p>
<p>Quedo a tu total disposición por este canal abierto por si en algún momento surge el interés de explorar alguna sinergia.</p>
<p>Un abrazo grande,</p>
"""

html = TEMPLATE.format(
    subject=SUBJECT,
    gif=GIF,
    title="Colaboración en Salud Digital e Integración",
    subtitle="Módulos de validación de receta e IA clínica para el ecosistema de la AMA",
    body=body_html,
    cta_url=WA_LINK,
    cta_label="Coordinar charla por WhatsApp"
)

msg = MIMEMultipart("alternative")
msg["From"] = FROM
msg["To"] = f"Ariel Perrone <{TO}>"
msg["Subject"] = SUBJECT
msg["Reply-To"] = "contacto@autamedica.com"
msg.attach(MIMEText(html, "html", "utf-8"))

print("Enviando correo a Ariel Perrone...")
server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
server.send_message(msg)
server.quit()
print("✅ Correo enviado exitosamente a Ariel Perrone!")
