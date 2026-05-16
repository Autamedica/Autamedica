#!/usr/bin/env python3
"""
Campaña de Anuncio: Receta Electrónica Nacional AutaMedica
Usa Brevo + Resend para maximizar envíos diarios.

Uso:
  python3 send_receta_announcement.py --dry-run        # Ver destinatarios sin enviar
  python3 send_receta_announcement.py --role patient    # Solo pacientes
  python3 send_receta_announcement.py --role doctor     # Solo médicos
  python3 send_receta_announcement.py                   # Enviar a todos
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

# ── Configuración ──────────────────────────────────────────────────────────
SUPABASE_URL = "https://qxjjrpksmwwrmubhvjew.supabase.co"

# Cargar keys desde .env
ENV_MAIN = Path("/home/edu/Autamedica/apps/web/.env")
ENV_GROWTH = Path("/home/edu/autamedica-growth-os/.env")

def _load_env_key(key: str) -> str:
    for env_path in [ENV_MAIN, ENV_GROWTH]:
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith(f"{key}="):
                    val = line.split("=", 1)[1].strip()
                    if val and not val.startswith("..."):
                        return val
    # Fallback para BREVO: buscar en scripts legacy
    if key == "BREVO_API_KEY":
        import re
        for path in [Path("/home/edu/send_test_email.py"), Path("/home/edu/send_test_email_v5.py")]:
            if path.exists():
                match = re.search(r"""(?:api_key|API_KEY)\s*=\s*['"]([^'"]+)['"]""", path.read_text())
                if match:
                    return match.group(1)
    raise RuntimeError(f"No se encontró {key}")

SUPABASE_SERVICE_KEY = _load_env_key("SUPABASE_SERVICE_ROLE_KEY")
BREVO_API_KEY = _load_env_key("BREVO_API_KEY")
RESEND_API_KEY = _load_env_key("RESEND_API_KEY")

# ── Sender ─────────────────────────────────────────────────────────────────
SENDER_NAME = "Receta Electrónica · AutaMedica"
SENDER_EMAIL = "contacto@autamedica.com"

# ── Cuentas a excluir (test, demo, propias) ────────────────────────────────
EXCLUDED_EMAILS = {
    # Eduardo (propias)
    "ecucondor@gmail.com",
    "autamedica@gmail.com",
    "eduardomarques006402@gmail.com",
    "marques.eduardo95466020@gmail.com",
    "eduardomarques@campus.fmed.uba.ar",
    "wa.@paciente.autamedica.com",
    # Demo / Test
    "doctor.demo@autamedica.com",
    "farmacia.demo@autamedica.com",
    "patient.demo@autamedica.com",
    "dr.garcia@autamedica.com",
    "britezruth@autamedica.com",
    # Emails internos autamedica
    "contacto@autamedica.com",
}
EXCLUDED_DOMAINS = {"invisible.email", "example.com", "test.com", "example.invalid"}

# ── Deduplicación ──────────────────────────────────────────────────────────
SENT_FILE = Path("/home/edu/.receta_campaign_sent.txt")

def load_sent_emails() -> set[str]:
    """Carga emails ya enviados del archivo de deduplicación."""
    if not SENT_FILE.exists():
        return set()
    return {line.strip().lower() for line in SENT_FILE.read_text().splitlines() if line.strip()}

def mark_as_sent(email: str) -> None:
    """Agrega un email al archivo de deduplicación."""
    with SENT_FILE.open("a") as f:
        f.write(f"{email.lower()}\n")

# ── Límites por proveedor ──────────────────────────────────────────────────
BREVO_DAILY_LIMIT = 300
RESEND_DAILY_LIMIT = 100  # Free tier: 100/día

# ── Templates de Correo ───────────────────────────────────────────────────

PATIENT_BODY = """
<p>Hola <strong>{first_name}</strong>,</p>

<p>En AutaMedica mejoramos la forma en que accedés a tu medicación.</p>

<p>A partir de hoy, todas las consultas que requieran medicación incluyen nuestra nueva <strong>Receta Electrónica con validación digital instantánea</strong>.</p>

<p><strong>¿Qué significa esto para vos?</strong></p>
<ul>
  <li><strong>Aceptación Nacional:</strong> Es 100% legal y de aceptación obligatoria en todas las farmacias del país.</li>
  <li><strong>Cero Papeles:</strong> Ya no hace falta imprimir nada. Mostrás el código o el PDF desde tu celular y retirás.</li>
  <li><strong>Sin Rebotes:</strong> Olvidate de problemas en el mostrador por recetas perdidas o sellos ilegibles.</li>
  <li><strong>Instantánea:</strong> La receta llega a tu correo en segundos, apenas termina tu consulta.</li>
</ul>

<p>La próxima vez que necesites atención médica, agendá con nuestros profesionales y resolvé todo desde tu casa.</p>
"""

DOCTOR_BODY = """
<p>Hola <strong>Dr/a. {last_name}</strong>,</p>

<p>La experiencia de tus pacientes en la farmacia acaba de mejorar radicalmente.</p>

<p>En AutaMedica integramos <strong>firma electrónica homologada</strong> para que todas tus prescripciones sean aceptadas de forma obligatoria y sin fricciones en cualquier farmacia de Argentina.</p>

<ul>
  <li><strong>Cero rebotes:</strong> El farmacéutico valida tu código de barras en segundos desde su sistema.</li>
  <li><strong>Seguridad clínica:</strong> Mayor trazabilidad del acto médico y eliminación de fraudes.</li>
  <li><strong>Fidelización:</strong> Tu paciente valora la inmediatez y no tener que andar imprimiendo papeles.</li>
  <li><strong>Legalidad total:</strong> Cumple con la normativa vigente de receta electrónica en todo el territorio nacional.</li>
</ul>

<p>Entrá a tu portal médico y emití tu próxima receta con estándar nacional.</p>
"""

TEMPLATES = {
    "patient": {
        "subject": "Nueva Receta Electrónica Nacional — AutaMedica",
        "title": "Tu medicación, sin papeles y en segundos",
        "body_html": PATIENT_BODY,
        "cta_url": "https://www.autamedica.com/patients",
        "cta_label": "Agendar una consulta",
    },
    "doctor": {
        "subject": "Tus recetas ahora son 100% digitales y válidas en todo el país",
        "title": "Prescripción electrónica con validez nacional",
        "body_html": DOCTOR_BODY,
        "cta_url": "https://www.autamedica.com/auth/login?role=doctor&portal=doctors&returnTo=https%3A%2F%2Fdoctor.autamedica.com%2F",
        "cta_label": "Entrar al Portal Médico",
    },
}

# ── Funciones ──────────────────────────────────────────────────────────────

def fetch_profiles(role: str | None = None) -> list[dict]:
    """Trae perfiles activos desde Supabase, filtrados por rol."""
    url = f"{SUPABASE_URL}/rest/v1/profiles?active=eq.true&select=user_id,email,first_name,last_name,role&email=not.is.null"
    if role:
        url += f"&role=eq.{role}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req) as resp:
        profiles = json.loads(resp.read().decode())

    # Filtrar excluidos
    filtered = []
    for p in profiles:
        email = (p.get("email") or "").lower().strip()
        if not email:
            continue
        if email in EXCLUDED_EMAILS:
            continue
        domain = email.split("@")[-1] if "@" in email else ""
        if domain in EXCLUDED_DOMAINS:
            continue
        filtered.append(p)
    return filtered


def send_via_brevo(profile: dict, template: dict) -> dict:
    """Envía usando Brevo (template institucional #8)."""
    first_name = profile.get("first_name") or "Usuario"
    last_name = profile.get("last_name") or ""
    email = profile["email"]
    body = template["body_html"].format(first_name=first_name, last_name=last_name)

    payload = {
        "sender": {"name": SENDER_NAME, "email": SENDER_EMAIL},
        "replyTo": {"name": "AutaMedica", "email": SENDER_EMAIL},
        "to": [{"email": email, "name": f"{first_name} {last_name}".strip()}],
        "templateId": 8,
        "params": {
            "subject": template["subject"],
            "title": template["title"],
            "body_html": body,
            "cta_url": template["cta_url"],
            "cta_label": template["cta_label"],
            "secondary_url": f"mailto:{SENDER_EMAIL}",
            "secondary_label": SENDER_EMAIL,
            "signature_name": "Equipo AutaMedica",
        },
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode(),
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return {"status": "ok", "provider": "brevo", **json.loads(resp.read().decode())}
    except urllib.error.HTTPError as exc:
        return {"status": "error", "provider": "brevo", "code": exc.code, "detail": exc.read().decode()}


def send_via_resend(profile: dict, template: dict) -> dict:
    """Envía usando Resend (HTML directo, sin template)."""
    first_name = profile.get("first_name") or "Usuario"
    last_name = profile.get("last_name") or ""
    email = profile["email"]
    body = template["body_html"].format(first_name=first_name, last_name=last_name)

    # Wrap en HTML básico con estilos inline
    full_html = f"""
    <html><body style="font-family:'Inter',Arial,sans-serif;color:#0f172a;line-height:1.7;max-width:600px;margin:0 auto;padding:24px">
      <div style="text-align:center;margin-bottom:24px">
        <img src="https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/public/public_assets/autamedica-reference-style.gif" alt="AutaMedica" style="max-width:100%;border-radius:12px" />
      </div>
      <h1 style="color:#0F2B46;font-size:22px;font-family:Georgia,serif;margin-bottom:8px">{template['title']}</h1>
      {body}
      <div style="text-align:center;margin:32px 0">
        <a href="{template['cta_url']}" style="background:#1B4F72;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">{template['cta_label']}</a>
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0" />
      <p style="font-size:12px;color:#94a3b8;text-align:center">
        © 2026 AutaMedica · <a href="https://www.autamedica.com" style="color:#64748b">autamedica.com</a><br/>
        <a href="mailto:{SENDER_EMAIL}" style="color:#64748b">{SENDER_EMAIL}</a>
      </p>
    </body></html>
    """

    payload = {
        "from": f"{SENDER_NAME} <{SENDER_EMAIL}>",
        "to": [email],
        "subject": template["subject"],
        "html": full_html,
        "tags": [
            {"name": "campaign", "value": "receta_electronica_announcement"},
            {"name": "role", "value": profile.get("role", "unknown")},
        ],
    }
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return {"status": "ok", "provider": "resend", **json.loads(resp.read().decode())}
    except urllib.error.HTTPError as exc:
        return {"status": "error", "provider": "resend", "code": exc.code, "detail": exc.read().decode()}


def main():
    parser = argparse.ArgumentParser(description="Campaña Receta Electrónica AutaMedica")
    parser.add_argument("--role", choices=["patient", "doctor"], help="Filtrar por rol")
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar destinatarios, no enviar")
    parser.add_argument("--delay", type=float, default=0.4, help="Segundos entre envíos (default: 0.4)")
    parser.add_argument("--brevo-limit", type=int, default=BREVO_DAILY_LIMIT, help=f"Límite Brevo (default: {BREVO_DAILY_LIMIT})")
    parser.add_argument("--resend-limit", type=int, default=RESEND_DAILY_LIMIT, help=f"Límite Resend (default: {RESEND_DAILY_LIMIT})")
    args = parser.parse_args()

    roles = [args.role] if args.role else ["patient", "doctor"]
    total_limit = args.brevo_limit + args.resend_limit

    # Cargar emails ya enviados para deduplicar
    already_sent = load_sent_emails()

    # Juntar todos los perfiles
    all_profiles: list[tuple[str, dict]] = []
    skipped_dedup = 0
    for role in roles:
        profiles = fetch_profiles(role)
        for p in profiles:
            email = (p.get("email") or "").lower().strip()
            if email in already_sent:
                skipped_dedup += 1
                continue
            all_profiles.append((role, p))

    print(f"\n{'='*60}")
    print(f"  📧 CAMPAÑA: Receta Electrónica Nacional")
    print(f"  📊 Total destinatarios nuevos: {len(all_profiles)}")
    if skipped_dedup:
        print(f"  ⏭️  Ya enviados (saltados): {skipped_dedup}")
    print(f"  🔧 Brevo: hasta {args.brevo_limit} | Resend: hasta {args.resend_limit}")
    print(f"  📬 Capacidad total: {total_limit} correos")
    print(f"{'='*60}")

    if args.dry_run:
        for i, (role, p) in enumerate(all_profiles, 1):
            name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or "Sin nombre"
            provider = "brevo" if i <= args.brevo_limit else "resend" if i <= total_limit else "⛔ excede"
            print(f"  [{i}/{len(all_profiles)}] 🔍 [{provider:6}] [{role:7}] {name} <{p['email']}>")
        print(f"\n{'='*60}")
        print(f"  🔍 DRY RUN. No se envió nada.")
        print(f"{'='*60}\n")
        return

    # Envío real
    sent_brevo = 0
    sent_resend = 0
    errors = 0

    for i, (role, p) in enumerate(all_profiles, 1):
        name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or "Sin nombre"
        template = TEMPLATES[role]

        if sent_brevo < args.brevo_limit:
            result = send_via_brevo(p, template)
            sent_brevo += 1
        elif sent_resend < args.resend_limit:
            result = send_via_resend(p, template)
            sent_resend += 1
        else:
            print(f"  [{i}/{len(all_profiles)}] ⛔ LÍMITE ALCANZADO — {name} <{p['email']}>")
            continue

        provider = result.get("provider", "?")
        if result["status"] == "ok":
            mark_as_sent(p["email"])
            print(f"  [{i}/{len(all_profiles)}] ✅ [{provider:6}] {name} <{p['email']}>")
        else:
            errors += 1
            detail = result.get("detail", "error desconocido")[:80]
            print(f"  [{i}/{len(all_profiles)}] ❌ [{provider:6}] {name} <{p['email']}> — {detail}")

        time.sleep(args.delay)

    print(f"\n{'='*60}")
    print(f"  🚀 CAMPAÑA FINALIZADA")
    print(f"  ✅ Brevo:  {sent_brevo} enviados")
    print(f"  ✅ Resend: {sent_resend} enviados")
    print(f"  ❌ Errores: {errors}")
    print(f"  📊 Total:  {sent_brevo + sent_resend} / {len(all_profiles)}")
    if len(all_profiles) > total_limit:
        remaining = len(all_profiles) - total_limit
        print(f"  ⏳ Pendientes para mañana: {remaining}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
