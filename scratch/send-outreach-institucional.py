"""
AutaMedica — Outreach institucional personalizado (15 contactos x 4 tiers).
Template: réplica Brevo #8 via Gmail SMTP.
"""
import smtplib, time
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

# ─── 15 CONTACTOS PERSONALIZADOS ───────────────────────────────

EMAILS = [
    # TIER 1 — GOBIERNO
    {
        "to": "gerenciaepicaba@buenosaires.gob.ar",
        "name": "Gerencia Operativa de Epidemiología",
        "subject": "Propuesta: alertas de brotes 72hs antes del reporte hospitalario — piloto gratuito para CABA",
        "title": "Alertas epidemiológicas antes de que lleguen a la guardia",
        "subtitle": "Sistema de vigilancia sindrómica activa, ya operando con +1.200 pacientes en producción",
        "body": """<p>Estimados,</p>
<p>Les escribo porque desarrollamos algo que creemos puede serles útil de forma inmediata: un <strong>sistema que detecta brotes epidemiológicos 72 horas antes</strong> de que se registren en el circuito hospitalario.</p>
<p><strong>¿Cómo les impacta?</strong></p>
<ul style="padding-left:20px;">
<li>Reciben <strong>alertas automáticas</strong> cuando un síndrome supera el umbral estacional en una zona</li>
<li>Datos codificados en <strong>SNOMED-CT / ICD-11</strong>, compatibles con SNVS 2.0</li>
<li>Esta semana detectamos un brote con <strong>+124% de incremento</strong> vs. promedio — antes de la notificación oficial</li>
</ul>
<p>Ofrecemos un <strong>piloto gratuito de 30 días</strong> para CABA. Sin integración compleja, sin costo.</p>
<p>Si la propuesta es de su interés, quedo a disposición para responder a este correo y profundizar en los detalles técnicos.</p>""",
    },
    {
        "to": "mesadeentradas@msal.gov.ar",
        "name": "Mesa de Entradas — Ministerio de Salud",
        "subject": "Propuesta: Sistema de vigilancia sindrómica activa con IA — datos primarios en tiempo real",
        "title": "Vigilancia sindrómica que complementa el SNVS 2.0",
        "subtitle": "Datos primarios codificados SNOMED-CT, capturados antes del reporte hospitalario",
        "body": """<p>Estimados,</p>
<p>Solicitamos que esta propuesta sea derivada a la <strong>Subsecretaría de Vigilancia Epidemiológica</strong>.</p>
<p>Operamos un sistema de telemedicina con <strong>+1.200 pacientes activos</strong> que captura síntomas en tiempo real y los codifica automáticamente bajo estándares SNOMED-CT / ICD-11.</p>
<p><strong>¿Qué aporta al Ministerio?</strong></p>
<ul style="padding-left:20px;">
<li><strong>Datos primarios</strong> que hoy no llegan al SNVS: síntomas reportados antes de la consulta hospitalaria</li>
<li><strong>Detección automática de brotes</strong> con alertas cuando un síndrome supera umbrales estacionales</li>
<li>Interoperabilidad nativa con sistemas de salud pública (HL7 FHIR)</li>
</ul>
<p>Si la propuesta es de su interés, quedamos a su entera disposición para responder a este correo y compartir más detalles.</p>""",
    },
    {
        "to": "epidemiologia@ms.gba.gov.ar",
        "name": "Dirección de Epidemiología — Prov. Buenos Aires",
        "subject": "Propuesta: detección temprana de brotes para la provincia — piloto sin costo",
        "title": "Anticipar brotes en la provincia más grande del país",
        "subtitle": "Sistema probado con +1.200 pacientes, listo para escalar a PBA",
        "body": """<p>Estimados,</p>
<p>Sabemos que coordinar vigilancia epidemiológica para <strong>17 millones de habitantes</strong> con datos que llegan con días de retraso es un desafío constante.</p>
<p>Desarrollamos un sistema que <strong>captura síntomas directamente del paciente</strong> (vía WhatsApp y telemedicina) y genera alertas automáticas de brotes <strong>antes de que lleguen al hospital</strong>.</p>
<p><strong>Resultado concreto:</strong> esta semana detectamos un incremento del <strong>+124%</strong> en un síndrome respiratorio, 72 horas antes de que apareciera en reportes hospitalarios.</p>
<p>Proponemos un <strong>piloto gratuito en un municipio</strong> a elección. Sin integración compleja.</p>
<p>Si la iniciativa es de su interés, quedo a disposición para responder a este correo y profundizar en los detalles técnicos.</p>""",
    },
    {
        "to": "secretariadireccion@ine.gov.ar",
        "name": "INE — ANLIS Malbrán",
        "subject": "Propuesta: datos primarios de vigilancia sindrómica para complementar la red de laboratorios",
        "title": "Datos de síntomas antes de que lleguen al laboratorio",
        "subtitle": "Codificación SNOMED-CT automática desde atención primaria",
        "body": """<p>Estimados,</p>
<p>Entendemos que el INE recibe muestras <strong>después</strong> de que un brote ya se manifestó clínicamente. Tenemos datos que pueden complementar esa cadena.</p>
<p>Nuestro sistema captura síntomas de <strong>+1.200 pacientes en tiempo real</strong> y los codifica automáticamente en SNOMED-CT / ICD-11. Cuando un síndrome supera el umbral estacional, generamos una <strong>alerta automática con geolocalización</strong>.</p>
<p><strong>¿Qué ganan?</strong> Una capa de datos primarios que llega <strong>antes</strong> de la derivación a laboratorio — señal temprana para priorizar recursos diagnósticos.</p>
<p>Si la propuesta es de su interés, quedo a disposición para responder a este correo y compartir más detalles.</p>""",
    },
    {
        "to": "pwr-arg@paho.org",
        "name": "OPS/OMS Argentina",
        "subject": "Propuesta: plataforma de vigilancia sindrómica activa operando en Argentina — potencial para la región",
        "title": "Vigilancia sindrómica activa, ya en producción",
        "subtitle": "Sistema argentino con potencial de réplica regional para OPS",
        "body": """<p>Estimada Dra. Jané Llopis,</p>
<p>Desde AutaMedica operamos un sistema de vigilancia sindrómica activa con <strong>+1.200 pacientes en producción</strong> en Argentina. Capturamos síntomas en tiempo real vía telemedicina, los codificamos automáticamente en <strong>SNOMED-CT / ICD-11</strong>, y generamos alertas de brotes antes del reporte hospitalario.</p>
<p><strong>¿Por qué le escribimos a OPS?</strong></p>
<ul style="padding-left:20px;">
<li>El sistema ya demostró <strong>detección 72hs antes</strong> del circuito tradicional</li>
<li>Es replicable en cualquier país de la región con acceso a WhatsApp</li>
<li>Interoperabilidad nativa HL7 FHIR, compatible con estándares OPS/OMS</li>
</ul>
<p>Nos encantaría explorar si hay programas de cooperación técnica o financiamiento donde esto encaje. Si la propuesta es de su interés, quedo a disposición para responder a este correo.</p>""",
    },

    # TIER 2 — LABORATORIOS FARMA
    {
        "to": "cac.farmacovigilancia@roche.com",
        "name": "Farmacovigilancia — Roche Argentina",
        "subject": "Propuesta: datos de síntomas en tiempo real para farmacovigilancia y Real World Evidence",
        "title": "Señales de farmacovigilancia desde atención primaria",
        "subtitle": "Datos anonimizados, codificados SNOMED-CT, actualizados en tiempo real",
        "body": """<p>Estimados,</p>
<p>Operamos una plataforma de telemedicina con <strong>+1.200 pacientes activos</strong> que registra síntomas, medicación y evolución clínica en tiempo real.</p>
<p><strong>¿Qué datos pueden obtener?</strong></p>
<ul style="padding-left:20px;">
<li><strong>Señales de farmacovigilancia</strong>: correlación síntomas-medicación desde atención primaria</li>
<li><strong>Real World Evidence</strong>: prevalencia de síntomas por zona, edad y temporada</li>
<li>Todo codificado en <strong>SNOMED-CT / ICD-11</strong>, listo para análisis</li>
</ul>
<p>Los datos son anonimizados y cumplen con regulaciones de protección de datos de salud.</p>
<p>Si esta tecnología y el tipo de señales clínicas que genera el sistema son de su interés, quedo a disposición para responder a este correo.</p>""",
    },
    {
        "to": "argentina.informacion_medica@roche.com",
        "name": "Información Médica — Roche Argentina",
        "subject": "Innovación en datos clínicos primarios para investigación — AutaMedica",
        "title": "Datos clínicos estructurados desde el primer contacto con el paciente",
        "subtitle": "Plataforma registrada ante MSAL, operando en producción",
        "body": """<p>Estimados,</p>
<p>Desarrollamos una plataforma de telemedicina que captura datos clínicos <strong>desde el primer contacto del paciente</strong> — antes de la consulta hospitalaria — y los estructura automáticamente en SNOMED-CT.</p>
<p>Creemos que hay valor para equipos de información médica en acceder a <strong>datos de prevalencia de síntomas en tiempo real</strong>, especialmente para áreas terapéuticas donde Roche lidera.</p>
<p>Si la propuesta y el perfil de AutaMedica son de su interés, quedo a disposición para responder a este correo.</p>""",
    },
    {
        "to": "Calidadproducto-Argentina@pfizer.com",
        "name": "Calidad y Farmacovigilancia — Pfizer Argentina",
        "subject": "Propuesta: señales de farmacovigilancia desde datos primarios en tiempo real",
        "title": "Detección temprana de señales adversas desde atención primaria",
        "subtitle": "Datos codificados SNOMED-CT de +1.200 pacientes activos",
        "body": """<p>Estimados,</p>
<p>Operamos un sistema de telemedicina que registra síntomas y medicación de <strong>+1.200 pacientes</strong> en tiempo real. Detectamos automáticamente correlaciones síntoma-medicación que pueden constituir <strong>señales de farmacovigilancia</strong>.</p>
<p><strong>¿Qué pueden obtener?</strong></p>
<ul style="padding-left:20px;">
<li>Datos post-marketing anonimizados desde atención primaria</li>
<li>Alertas automáticas de señales adversas por principio activo</li>
<li>Todo codificado en estándares internacionales (SNOMED-CT / ICD-11)</li>
</ul>
<p>Si la propuesta es de su interés, quedo a disposición para responder a este correo.</p>""",
    },
    {
        "to": "soibago@bago.com.ar",
        "name": "SOI — Laboratorios Bagó",
        "subject": "Propuesta: datos de prevalencia de síntomas en tiempo real para inteligencia comercial",
        "title": "Qué síntomas están creciendo hoy en Argentina",
        "subtitle": "Datos anonimizados de +1.200 pacientes, actualizados en tiempo real",
        "body": """<p>Estimados,</p>
<p>Operamos una plataforma de telemedicina que captura síntomas de <strong>+1.200 pacientes</strong> en tiempo real y detecta tendencias epidemiológicas antes del reporte hospitalario.</p>
<p><strong>¿En qué les suma?</strong></p>
<ul style="padding-left:20px;">
<li><strong>Forecast de demanda</strong>: saber qué patologías están creciendo por zona antes que la competencia</li>
<li><strong>Farmacovigilancia</strong>: correlaciones síntoma-medicación desde datos primarios</li>
<li>Datos codificados y anonimizados, listos para análisis</li>
</ul>
<p>Si la propuesta y el perfil de AutaMedica son de su interés, quedo a disposición para responder a este correo.</p>""",
    },
    {
        "to": "farmacovigilancia@roemmers.com.ar",
        "name": "Farmacovigilancia — Roemmers",
        "subject": "Propuesta: señales de farmacovigilancia desde datos primarios de telemedicina",
        "title": "Farmacovigilancia con datos que hoy no existen en el circuito",
        "subtitle": "Síntomas capturados antes de la consulta hospitalaria, codificados SNOMED-CT",
        "body": """<p>Estimados,</p>
<p>El mayor laboratorio argentino merece los mejores datos. Operamos un sistema con <strong>+1.200 pacientes</strong> que registra síntomas y medicación en tiempo real — datos que hoy <strong>no llegan al circuito de farmacovigilancia tradicional</strong> porque se pierden en la consulta ambulatoria.</p>
<p><strong>¿Qué ofrecemos?</strong></p>
<ul style="padding-left:20px;">
<li>Correlaciones automáticas síntoma-medicación como señales tempranas</li>
<li>Prevalencia de síntomas por zona geográfica y franja etaria</li>
<li>API de datos anonimizados en formato estándar</li>
</ul>
<p>Si la propuesta es de su interés, quedo a disposición para responder a este correo.</p>""",
    },

    # TIER 3 — PREPAGAS
    {
        "to": "gerencia@osde.com.ar",
        "name": "Gerencia General — OSDE",
        "subject": "Propuesta: reducir internaciones detectando brotes antes del pico — caso real con datos",
        "title": "Anticipar el pico para reducir la saturación de guardias",
        "subtitle": "Sistema de triaje predictivo ya operando con +1.200 pacientes",
        "body": """<p>Estimados,</p>
<p>Cada invierno, las guardias de OSDE se saturan con consultas respiratorias que podrían haberse anticipado. Tenemos datos que demuestran que <strong>se puede detectar un brote 72 horas antes del pico</strong>.</p>
<p><strong>¿Qué gana OSDE?</strong></p>
<ul style="padding-left:20px;">
<li><strong>Triaje predictivo</strong>: derivar recursos antes de que la guardia colapse</li>
<li><strong>Reducción de internaciones</strong>: intervención temprana en población de riesgo</li>
<li><strong>Datos propios</strong>: prevalencia de síntomas de sus afiliados en tiempo real</li>
</ul>
<p>Modelo per-member-per-month. Piloto gratuito de 30 días.</p>
<p>Si la propuesta es de su interés, quedo a disposición para responder a este correo.</p>""",
    },
    {
        "to": "info@swissmedical.com.ar",
        "name": "Swiss Medical Group",
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
<p>Si la propuesta y el inicio de un piloto gratuito son de su interés, quedo a disposición para responder a este correo.</p>""",
    },
    {
        "to": "mirna.kaploen@galenoargentina.com.ar",
        "name": "Mirna Kaploen — Galeno",
        "subject": "Propuesta: triaje predictivo para anticipar demanda estacional — AutaMedica",
        "title": "Anticipar la demanda antes de que llegue a la guardia",
        "subtitle": "Datos en tiempo real para optimizar recursos clínicos",
        "body": """<p>Estimada Mirna,</p>
<p>Galeno viene creciendo fuerte en digital. Tenemos algo que encaja: un sistema que <strong>detecta cuándo va a crecer la demanda de guardia por zona</strong>, con 72 horas de anticipación.</p>
<p><strong>Resultado concreto:</strong> esta semana detectamos un brote respiratorio con +124% de incremento antes de la notificación oficial.</p>
<p>Modelo per-member-per-month. Si la propuesta y el inicio de un piloto gratuito son de su interés, quedo a disposición para responder a este correo.</p>""",
    },

    # TIER 4 — ACADEMIA
    {
        "to": "innova.saluddigital@hospitalitaliano.org.ar",
        "name": "Depto. Informática en Salud — Hospital Italiano",
        "subject": "Colaboración: plataforma de vigilancia epidemiológica con codificación SNOMED-CT automática",
        "title": "SNOMED-CT automático desde atención primaria",
        "subtitle": "Sistema en producción con +1.200 pacientes — buscamos validación académica",
        "body": """<p>Estimados,</p>
<p>Sabemos que el DIS del Hospital Italiano es referente en informática médica en Argentina. Les escribimos porque desarrollamos algo que creemos merece su evaluación técnica.</p>
<p><strong>Qué hace el sistema:</strong></p>
<ul style="padding-left:20px;">
<li>Captura síntomas vía telemedicina y los codifica <strong>automáticamente en SNOMED-CT / ICD-11</strong></li>
<li>Detecta anomalías estadísticas (brotes) en tiempo real</li>
<li>Opera en producción con <strong>+1.200 pacientes</strong>, registrado ante MSAL</li>
</ul>
<p><strong>¿Qué buscamos?</strong> Validación académica y posible colaboración en investigación. Publicamos datos que hoy no existen en el circuito sanitario argentino.</p>
<p>Si la propuesta es de su interés, quedo a disposición para responder a este correo.</p>""",
    },
    {
        "to": "info@fundacionsadosky.org.ar",
        "name": "Fundación Sadosky",
        "subject": "Proyecto de IA en salud operando en producción — posible co-financiamiento",
        "title": "IA aplicada a vigilancia epidemiológica — ya en producción",
        "subtitle": "Sistema argentino con +1.200 pacientes, registrado ante MSAL",
        "body": """<p>Estimados,</p>
<p>Desarrollamos un sistema de <strong>inteligencia artificial aplicada a vigilancia epidemiológica</strong> que ya opera en producción con +1.200 pacientes en Argentina.</p>
<p><strong>Innovación técnica:</strong></p>
<ul style="padding-left:20px;">
<li>Codificación automática de síntomas en SNOMED-CT mediante procesamiento de lenguaje natural</li>
<li>Detección estadística de brotes en tiempo real</li>
<li>Interoperabilidad HL7 FHIR nativa</li>
</ul>
<p>Buscamos explorar si hay <strong>líneas de financiamiento o programas de la Fundación</strong> donde este proyecto encaje para escalar.</p>
<p>Si la propuesta y el perfil de AutaMedica son de su interés, quedo a disposición para responder a este correo.</p>""",
    },
]

def send_all(dry_run=True):
    if not dry_run:
        server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)

    for i, e in enumerate(EMAILS, 1):
        html = TEMPLATE.format(
            subject=e["subject"], gif=GIF, title=e["title"],
            subtitle=e["subtitle"], body=e["body"],
            cta_url=WA_LINK, cta_label="Coordinar reunión por WhatsApp",
        )
        msg = MIMEMultipart("alternative")
        msg["From"] = FROM
        msg["To"] = f'{e["name"]} <{e["to"]}>'
        msg["Subject"] = e["subject"]
        msg["Reply-To"] = "contacto@autamedica.com"
        msg.attach(MIMEText(html, "html", "utf-8"))

        if dry_run:
            print(f"[{i:02d}/15] DRY RUN → {e['to']}")
            print(f"         Subject: {e['subject']}")
        else:
            server.send_message(msg)
            print(f"[{i:02d}/15] ✅ Enviado → {e['to']}")
            if i < len(EMAILS):
                time.sleep(5)  # rate limit

    if not dry_run:
        server.quit()
    print(f"\n{'DRY RUN completado' if dry_run else '✅ 15/15 emails enviados'}")

if __name__ == "__main__":
    import sys
    dry = "--send" not in sys.argv
    if dry:
        print("⚠️  Modo DRY RUN. Usá --send para enviar de verdad.\n")
    send_all(dry_run=dry)
