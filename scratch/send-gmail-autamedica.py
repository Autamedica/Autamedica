"""
AutaMedica — Envío via Gmail SMTP con template institucional (replica Brevo Template #8).

Uso:
    python3 send-gmail-autamedica.py

Parámetros editables en la sección CONFIGURAR abajo.
"""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ─── SMTP CONFIG ───────────────────────────────────────────────
GMAIL_USER = "autamedica@gmail.com"
GMAIL_APP_PASSWORD = "cmcq pmwa xanv zekl"
FROM_NAME = "AutaMedica"
FROM_EMAIL = "contacto@autamedica.com"

# ─── CONFIGURAR CADA ENVÍO ─────────────────────────────────────
TO_EMAIL = "ecucondor@gmail.com"
TO_NAME = "Eduardo"

SUBJECT = "Detección temprana de brotes epidemiológicos — Propuesta de piloto"
TITLE = "Vigilancia Sindrómica Activa"
SUBTITLE = "Inteligencia epidemiológica en tiempo real para su institución"

BODY_HTML = """
<p>Estimados,</p>
<p>Desde <strong>AutaMedica</strong> desarrollamos un sistema de vigilancia sindrómica activa
que detecta brotes epidemiológicos en tiempo real, antes de que lleguen al sistema hospitalario.</p>
<p>Ya operamos en producción con <strong>+1.200 pacientes</strong> y datos clínicos
estructurados bajo estándares internacionales (SNOMED-CT / ICD-11).</p>
<p>Esta semana detectamos un <strong>brote activo con +124% de incremento</strong> respecto
al promedio estacional, 72 horas antes de la notificación oficial.</p>
<p>¿Podemos coordinar 15 minutos para una demo en vivo del sistema?</p>
"""

CTA_URL = "https://doctor.autamedica.com"
CTA_LABEL = "Ver Dashboard en Vivo"
SECONDARY_URL = "mailto:contacto@autamedica.com"
SECONDARY_LABEL = "contacto@autamedica.com"
SIGNATURE_NAME = "Eduardo Marques"


# ─── TEMPLATE (replica exacta de Brevo Template #8) ────────────
GIF_URL = "https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/public/public_assets/autamedica-reference-style.gif"

TEMPLATE = """<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{subject}</title></head>
  <body style="margin:0;padding:0;background:#f4f7fa;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#334155;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fa;margin:0;padding:24px 12px;"><tr><td style="background:linear-gradient(135deg,#143B5A,#2876A4);padding:40px 40px 28px;text-align:center;"><img src="{gif_url}" alt="AutaMedica" style="display:block;width:225px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto 24px;background:#ffffff;"><div style="color:#DDEAF4;font-size:15px;line-height:1.2;letter-spacing:1.2px;text-transform:uppercase;font-weight:500;">Telemedicina para LATAM</div></td></tr>
        <tr><td style="padding:32px 40px 8px;"><h1 style="font-family:Georgia,'Times New Roman',serif;color:#0F2B46;font-size:24px;line-height:1.25;font-weight:700;margin:0;letter-spacing:0;">{title}</h1><p style="margin:12px 0 0;color:#64748B;font-size:15px;line-height:1.6;">{subtitle}</p></td></tr>
        <tr><td style="padding:16px 40px 24px;color:#334155;font-size:15px;line-height:1.7;">{body_html}</td></tr>
        <tr><td style="padding:0 40px 32px;"><a href="{cta_url}" style="display:inline-block;background:#1B4F72;color:#ffffff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">{cta_label}</a><a href="{secondary_url}" style="display:inline-block;margin-left:10px;border:1.5px solid #1B4F72;color:#1B4F72;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">{secondary_label}</a></td></tr>
        <tr><td style="border-top:1px solid #E2E8F0;padding:24px 40px 28px;color:#94A3B8;font-size:12px;line-height:1.6;"><p style="font-size:12px;color:#0F2B46;font-weight:700;margin:0 0 4px;">Fundador: {signature_name}</p><p style="margin:0 0 4px;">AutaMedica</p><p style="margin:0 0 4px;">Reg. MSAL: RL-2026-47574120-APN-SSVEIYES#MS | ID: 0268</p><p style="margin:0 0 12px;">HL7 FHIR · ReNaPDiS Recetario Electrónico</p><p style="margin:0 0 4px;"><a href="mailto:contacto@autamedica.com" style="color:#2471A3;text-decoration:none;font-weight:700;">contacto@autamedica.com</a> · <a href="https://autamedica.com" style="color:#2471A3;text-decoration:none;font-weight:700;">autamedica.com</a></p><p style="margin:14px 0 0;font-size:11px;color:#64748B;text-align:center;">© 2026 AutaMedica — Telemedicina hecha para LATAM</p>
      </table>
    </td></tr></table>
  </body>
</html>"""


def send_email():
    html = TEMPLATE.format(
        subject=SUBJECT,
        gif_url=GIF_URL,
        title=TITLE,
        subtitle=SUBTITLE,
        body_html=BODY_HTML,
        cta_url=CTA_URL,
        cta_label=CTA_LABEL,
        secondary_url=SECONDARY_URL,
        secondary_label=SECONDARY_LABEL,
        signature_name=SIGNATURE_NAME,
    )

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
    msg["To"] = f"{TO_NAME} <{TO_EMAIL}>"
    msg["Subject"] = SUBJECT
    msg["Reply-To"] = FROM_EMAIL
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(msg)

    print(f"✅ Enviado a {TO_EMAIL} desde {FROM_EMAIL}")


if __name__ == "__main__":
    send_email()
