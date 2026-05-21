import sys
sys.path.append("/home/edu")

import json
import time
import urllib.request
import urllib.error
from datetime import datetime
from brevo_autamedica_default import read_brevo_api_key, send_autamedica_email

API_KEY = read_brevo_api_key()

SYMPTOM = "Bronquiolitis y Dificultad Respiratoria"
WHATSAPP_NUMBER = "+54 9 11 6826-1552"
WHATSAPP_LINK = "https://wa.me/5491168261552?text=Hola%20AutaMedica,%20recibi%20la%20alerta.%20Quiero%20hacer%20el%20chequeo%20preventivo%20y%20grabar%20mi%20audio%20de%20sintomas"

SENDER = {
    "name": "AutaMedica - Alerta Temprana",
    "email": "contacto@autamedica.com",
}

# Excluir contactos sin email real
EXCLUDED = {"N/A", ""}

# ── Fetch all contacts ──
def fetch_all_contacts():
    all_contacts = []
    offset = 0
    while True:
        url = f"https://api.brevo.com/v3/contacts?limit=50&offset={offset}"
        req = urllib.request.Request(url, headers={"api-key": API_KEY, "Accept": "application/json"})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        contacts = data.get("contacts", [])
        all_contacts.extend(contacts)
        total = data.get("count", 0)
        if len(all_contacts) >= total or not contacts:
            break
        offset += 50
    return all_contacts

# ── Build email body ──
def build_body_html(name: str) -> str:
    greeting = f"Hola <strong>{name}</strong>." if name and name != "Sin nombre" else "Hola."
    return f"""
<p style="font-size: 16px; line-height: 1.6; color: #1e1e1e;">
  {greeting} Estamos evaluando un posible brote de <strong>{SYMPTOM}</strong> en diversas áreas urbanas y realizando un monitoreo epidemiológico activo.
</p>

<p style="font-size: 16px; line-height: 1.6; color: #1e1e1e;">
  Hacé un chequeo preventivo gratuito de 1 minuto para ayudarnos a identificar y geolocalizar casos de forma temprana:
</p>

<div style="background-color: #f7fafc; border-left: 4px solid #3182ce; padding: 16px; margin: 24px 0; border-radius: 4px;">
  <p style="margin: 0; font-size: 15px; font-weight: bold; color: #2b6cb0;">
    💬 Mandanos un audio de WhatsApp contándonos cómo te sentís:
  </p>
  <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #4a5568; line-height: 1.5;">
    <li>Qué síntomas sentís y desde hace cuántos días.</li>
    <li><strong>En qué barrio o localidad vivís actualmente.</strong></li>
    <li>Si tenés fiebre, dolor u otras molestias.</li>
  </ul>
  <p style="margin: 12px 0 0 0; font-size: 14px; font-weight: bold; color: #2d3748;">
    ⏱ Duración del audio: Mínimo 20 seg — Máximo 60 seg.
  </p>
</div>

<p style="font-size: 15px; line-height: 1.6; color: #4a5568; margin-top: 16px;">
  Hacé clic en el botón de abajo para iniciar la conversación en WhatsApp ({WHATSAPP_NUMBER}):
</p>
"""

# ── Main campaign ──
def run_campaign():
    print(f"[{datetime.now().isoformat()}] Iniciando campaña epidemiológica...")
    contacts = fetch_all_contacts()
    print(f"[{datetime.now().isoformat()}] Total contactos obtenidos: {len(contacts)}")

    sent = 0
    failed = 0
    skipped = 0
    errors_log = []

    for i, contact in enumerate(contacts):
        email = contact.get("email", "")
        if not email or email in EXCLUDED:
            skipped += 1
            continue

        attrs = contact.get("attributes", {})
        name = attrs.get("NOMBRE", attrs.get("FIRSTNAME", attrs.get("PRENOM", "")))
        lastname = attrs.get("APELLIDO", attrs.get("LASTNAME", attrs.get("NOM", "")))
        full_name = f"{name} {lastname}".strip() if (name or lastname) else ""

        try:
            response = send_autamedica_email(
                to=[{"email": email, "name": full_name or email.split("@")[0]}],
                subject="🚨 Alerta Epidemiológica: Reporte de síntomas preventivo",
                title="Chequeo Preventivo de Salud",
                subtitle="Sistema de Vigilancia Epidemiológica — AutaMedica",
                body_html=build_body_html(full_name),
                cta_url=WHATSAPP_LINK,
                cta_label="Grabar Audio en WhatsApp",
                secondary_url="https://doctor.autamedica.com",
                secondary_label="Ir al Portal de AutaMedica",
                signature_name="Centro de Control Epidemiológico — AutaMedica",
                sender=SENDER,
            )
            sent += 1
            status = response.get("status", "?")
            print(f"  [{sent+failed+skipped}/{len(contacts)}] ✅ {email} — status {status}")
        except Exception as e:
            failed += 1
            err_msg = str(e)
            errors_log.append({"email": email, "error": err_msg})
            print(f"  [{sent+failed+skipped}/{len(contacts)}] ❌ {email} — {err_msg[:80]}")

        # Rate limit: ~10 emails/sec max en Brevo free
        if (sent + failed) % 10 == 0:
            time.sleep(1.0)

    print(f"\n{'='*50}")
    print(f"[{datetime.now().isoformat()}] CAMPAÑA FINALIZADA")
    print(f"  ✅ Enviados: {sent}")
    print(f"  ❌ Fallidos: {failed}")
    print(f"  ⏭️  Omitidos: {skipped}")
    print(f"  📊 Total: {len(contacts)}")
    print(f"{'='*50}")

    if errors_log:
        print("\nErrores detallados:")
        for err in errors_log:
            print(f"  • {err['email']}: {err['error'][:120]}")

if __name__ == "__main__":
    run_campaign()
