import sys
sys.path.append("/home/edu")

from brevo_autamedica_default import send_autamedica_email

# Datos de la prueba
RECIPIENT_EMAIL = "ecucondor@gmail.com"
RECIPIENT_NAME = "Eduardo"
SYMPTOM = "Bronquiolitis y Dificultad Respiratoria"
WHATSAPP_NUMBER = "+54 9 11 6826-1552"
WHATSAPP_LINK = "https://wa.me/5491168261552?text=Hola%20AutaMedica,%20recibi%20la%20alerta.%20Quiero%20hacer%20el%20chequeo%20preventivo%20y%20grabar%20mi%20audio%20de%20sintomas"

subject = "🚨 Alerta Epidemiológica: Reporte de síntomas preventivo"
title = "Chequeo Preventivo de Salud"
subtitle = "Sistema de Vigilancia Epidemiológica — AutaMedica"

# Cuerpo del correo corregido para evitar errores de zona y solicitar la geolocalización de forma orgánica
body_html = f"""
<p style="font-size: 16px; line-height: 1.6; color: #1e1e1e;">
  Estamos evaluando un posible brote de <strong>{SYMPTOM}</strong> en diversas áreas urbanas y realizando un monitoreo epidemiológico activo.
</p>

<p style="font-size: 16px; line-height: 1.6; color: #1e1e1e;">
  Hacé un chequeo preventivo gratuito de 1 minuto para ayudarnos a identificar y geolocalizar casos de forma temprana:
</p>

<div style="background-color: #f7fafc; border-left: 4px solid #3182ce; padding: 16px; margin: 24px 0; border-radius: 4px;">
  <p style="margin: 0; font-size: 15px; font-weight: bold; color: #2b6cb0; display: flex; align-items: center;">
    💬 Mandanos un audio de WhatsApp contándonos cómo te sentís:
  </p>
  <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #4a5568; line-height: 1.5;">
    <li>Qué síntomas sentís y desde hace cuántos días.</li>
    <li><strong>En qué barrio o localidad vivís actualmente.</strong> (Esencial para el mapa de brotes).</li>
    <li>Si tenés fiebre, dolor u otras molestias.</li>
  </ul>
  <p style="margin: 12px 0 0 0; font-size: 14px; font-weight: bold; color: #2d3748;">
    ⏱ Duración del audio: Mínimo 20 segundos - Máximo 60 segundos.
  </p>
</div>

<p style="font-size: 15px; line-height: 1.6; color: #4a5568; margin-top: 16px;">
  Hacé clic en el botón de abajo para iniciar la conversación de WhatsApp en el número oficial <strong>{WHATSAPP_NUMBER}</strong>:
</p>
"""

print("Enviando correo de prueba corregido a:", RECIPIENT_EMAIL)

# Cambiamos el remitente para que sea puramente institucional
sender_override = {
    "name": "AutaMedica - Alerta Temprana",
    "email": "contacto@autamedica.com",
}

try:
    response = send_autamedica_email(
        to=[{"email": RECIPIENT_EMAIL, "name": RECIPIENT_NAME}],
        subject=subject,
        title=title,
        subtitle=subtitle,
        body_html=body_html,
        cta_url=WHATSAPP_LINK,
        cta_label="Grabar Audio en WhatsApp",
        secondary_url="https://doctor.autamedica.com",
        secondary_label="Ir al Portal de AutaMedica",
        signature_name="Centro de Control Epidemiológico — AutaMedica",
        sender=sender_override
    )
    print("¡Correo de prueba corregido enviado con éxito!")
    print("Respuesta de Brevo:", response)
except Exception as e:
    print("Error al enviar el correo:", str(e))
