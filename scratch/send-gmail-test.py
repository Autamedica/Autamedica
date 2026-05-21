import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

GMAIL_USER = "autamedica@gmail.com"
GMAIL_APP_PASSWORD = "REDACTED"

TO = "ecucondor@gmail.com"
SUBJECT = "TEST — Detección temprana de brotes epidemiológicos"

body_html = """
<div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #1e1e1e; line-height: 1.7; font-size: 15px;">

<p>Estimados,</p>

<p>Desde <strong>AutaMedica</strong> desarrollamos un sistema de vigilancia sindrómica activa que detecta brotes epidemiológicos en tiempo real, antes de que lleguen al sistema hospitalario.</p>

<p>Ya operamos en producción con <strong>+1.200 pacientes</strong> y datos clínicos estructurados bajo estándares internacionales (SNOMED-CT / ICD-11).</p>

<p>Esta semana detectamos un <strong>brote activo con +124% de incremento</strong> respecto al promedio estacional, 72 horas antes de la notificación oficial.</p>

<p>¿Podemos coordinar 15 minutos para una demo en vivo del sistema?</p>

<br>
<p>Saludos cordiales,</p>
<p><strong>AutaMedica — Centro de Control Epidemiológico</strong><br>
<a href="mailto:contacto@autamedica.com">contacto@autamedica.com</a><br>
<a href="https://doctor.autamedica.com">https://doctor.autamedica.com</a></p>

</div>
"""

msg = MIMEMultipart("alternative")
msg["From"] = f"AutaMedica <{GMAIL_USER}>"
msg["To"] = TO
msg["Subject"] = SUBJECT
msg["Reply-To"] = "contacto@autamedica.com"

msg.attach(MIMEText(body_html, "html", "utf-8"))

print(f"Enviando desde {GMAIL_USER} a {TO}...")

try:
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(msg)
    print("✅ Email enviado!")
except Exception as e:
    print(f"❌ Error: {e}")
