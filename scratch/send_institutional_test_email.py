#!/usr/bin/env python3
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

GMAIL_USER = "autamedica@gmail.com"
GMAIL_APP_PASSWORD = "cmcq pmwa xanv zekl"
FROM = "AutaMedica <contacto@autamedica.com>"
GIF = "https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/public/public_assets/autamedica-reference-style.gif"
WA_LINK = "https://wa.me/5491168261552?text=Hola%2C%20vi%20la%20propuesta%20de%20AutaMedica%20y%20me%20interesa%20coordinar%20una%20demo"

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

TEST_EMAIL = {
    "to": "ecucondor@gmail.com",
    "name": "Eduardo Marques (Test Prepaga)",
    "subject": "Propuesta: vigilancia sindrómica para su red de clínicas — piloto gratuito",
    "title": "Detectar brotes en su red antes de que saturen las guardias",
    "subtitle": "Integración directa con su red propia de clínicas",
    "body": """<p>Estimados,</p>
<p>Swiss Medical tiene algo que otras prepagas no tienen: <strong>red propia de clínicas</strong>. Eso hace posible una integración directa con nuestro sistema de vigilancia sindrómica.</p>
<p><strong>¿Qué les ofrecemos?</strong></p>
<ul style="padding-left:20px;">
<li>Alertas automáticas cuando un síndrome crece en una zona donde tienen clínicas</li>
<li>Triaje predictivo para redirigir pacientes antes del pico</li>
<li>Dashboard en tiempo real con datos de sus afiliados</li>
</ul>
<p>Si la propuesta y el inicio de un piloto gratuito son de su interés, quedo a disposición para responder a este correo.</p>"""
}

def send_test():
    print(f"⏳ Despachando correo de prueba institucional a {TEST_EMAIL['to']}...")
    server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
    server.login(GMAIL_USER, GMAIL_APP_PASSWORD)

    html = TEMPLATE.format(
        subject=TEST_EMAIL["subject"], gif=GIF, title=TEST_EMAIL["title"],
        subtitle=TEST_EMAIL["subtitle"], body=TEST_EMAIL["body"],
        cta_url=WA_LINK, cta_label="Coordinar reunión por WhatsApp",
    )
    msg = MIMEMultipart("alternative")
    msg["From"] = FROM
    msg["To"] = f'{TEST_EMAIL["name"]} <{TEST_EMAIL["to"]}>'
    msg["Subject"] = f"[TEST] {TEST_EMAIL['subject']}"
    msg["Reply-To"] = "contacto@autamedica.com"
    msg.attach(MIMEText(html, "html", "utf-8"))

    server.send_message(msg)
    server.quit()
    print("✅ ¡Correo de prueba enviado con éxito!")

if __name__ == "__main__":
    send_test()
