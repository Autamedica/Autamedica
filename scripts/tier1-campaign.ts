#!/usr/bin/env bun

/**
 * Tier 1 Link Building Campaign Generator
 *
 * Usage:
 *   bun scripts/tier1-campaign.ts "Eduardo García" "Founder & CEO" "edo@autamedica.com" "+54-9-11-1234-5678"
 *
 * Output:
 *   - Generated emails: ./campaigns/tier1-emails-generated.md
 *   - CSV for email clients: ./campaigns/tier1-contacts.csv
 *   - Press release: ./campaigns/press-release.txt
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface Contact {
  name: string;
  email: string;
  organization: string;
  da: number;
}



const CONTACTS: Contact[] = [
  {
    name: "Colegio Médico Argentino",
    email: "presidencia@colmedico.org.ar",
    organization: "CMA",
    da: 58,
  },
  {
    name: "Confederación Médica de Argentina",
    email: "contacto@confederacionmedica.org.ar",
    organization: "Confederación Médica",
    da: 55,
  },
  {
    name: "Sociedad Argentina de Cardiología",
    email: "director@sac.org.ar",
    organization: "SAC",
    da: 52,
  },
  {
    name: "Fundación Argentina Contra el Cáncer",
    email: "contacto@fac.org.ar",
    organization: "FAC",
    da: 50,
  },
  {
    name: "INCUCAI",
    email: "contacto@incucai.gov.ar",
    organization: "INCUCAI",
    da: 68,
  },
];

const TEMPLATES = [
  {
    contact: CONTACTS[0],
    subject:
      "Propuesta de colaboración: Recurso gratuito para profesionales médicos",
    body: `Estimado equipo del Colegio Médico Argentino,

Le escribo para proponer una colaboración que considero valiosa para sus miembros.

En AutaMedica, hemos desarrollado una **"Guía Completa de Telemedicina Segura para Profesionales de Salud"** que incluye:

- Regulaciones HIPAA y Ley 25.326 (protección de datos en Argentina)
- Mejores prácticas en consultas virtuales seguras
- Checklist de cumplimiento normativo
- Plataformas recomendadas y auditadas

**Propuesta:**
Ofrecerla de forma **GRATUITA** a través de su sitio como recurso oficial, con mención del CMA como "colaborador oficial" del proyecto.

**Beneficio para ustedes:**
- Valor agregado directo para sus miembros
- Posicionamiento como referente en telemedicina segura
- Recurso exclusivo que fortalece su comunidad

**Cómo funciona:**
1. Ustedes revisan y aprueban el contenido (es 100% editable)
2. Publicamos en su sitio con mención de AutaMedica como creador
3. Promovemos a través de nuestros canales

¿Les interesa conocer más detalles? Estoy disponible para una llamada breve esta semana.

Saludos cordiales,
[NOMBRE]
[CARGO]
AutaMedica
[EMAIL]
[TELÉFONO]`,
  },
  {
    contact: CONTACTS[1],
    subject:
      "Propuesta: Artículo sobre telemedicina segura para sus miembros",
    body: `Estimados,

Soy [NOMBRE] de AutaMedica. Quisiera proponer un artículo que podría ser útil para su boletín/newsletter:

**Título propuesto:**
"Telemedicina en Argentina: Cumplimiento Normativo y Mejores Prácticas para Médicos"

**Contenido:**
- Estado actual de regulación en Argentina (HIPAA, Ley 25.326)
- Cómo implementar telemedicina segura en tu práctica
- Casos reales y lecciones aprendidas
- Recursos y herramientas auditadas

**Formato:**
Artículo de 2,000 palabras, original, autorizado para uso exclusivo en su sitio

**Beneficio:**
- Contenido educativo de calidad para sus miembros
- Posicionamiento como referente en transformación digital de la salud
- Mención de AutaMedica como proveedora de soluciones

¿Te interesa? Puedo enviar un draft en 48h.

Saludos,
[NOMBRE]
AutaMedica
[EMAIL]`,
  },
  {
    contact: CONTACTS[2],
    subject:
      "Propuesta: Webinar educativo sobre telemedicina en cardiología",
    body: `Estimado Director,

Desde AutaMedica, desarrollamos soluciones de telemedicina especializada para cardiología. Nos gustaría ofrecer un **webinar educativo GRATUITO** para sus asociados:

**Tema:**
"Telemedicina en Cardiología: Implementación Segura y Seguimiento de Pacientes"

**Detalles:**
- Duración: 90 minutos
- Especialistas: Cardiólogo + especialista en telemedicina
- Contenido: casos prácticos, regulación, tecnología
- Participantes: Libre inscripción para miembros de SAC
- Certificado de asistencia incluido

**Qué ofrecemos:**
- Organización completa del evento
- Especialistas certificados
- Material educativo de calidad

**Lo que pedimos:**
- Promoción a vuestros miembros
- Mención en vuestro sitio
- Una presentación breve de AutaMedica al final

¿Les interesa desarrollar esto juntos? Sugiero agendar una llamada corta para discutir formato y fecha.

Disponible esta semana.

Saludos,
[NOMBRE]
AutaMedica
[EMAIL]
[TELÉFONO]`,
  },
  {
    contact: CONTACTS[3],
    subject:
      "Recurso: Seguimiento oncológico seguro por telemedicina",
    body: `Estimados,

Sabemos que el seguimiento de pacientes post-tratamiento oncológico es crítico. Hemos creado un **recurso educativo** específico para pacientes en seguimiento:

"Guía: Telemedicina Segura en Seguimiento Post-Oncológico"

Incluye:
- Cómo hacer consultas virtuales seguras
- Qué estudios pueden monitorearse remotamente
- Cuándo debe ser presencial
- Protección de privacidad

**Propuesta:**
Disponibilizar como recurso gratuito en vuestro sitio, con mención de FAC como colaborador.

¿Les interesa incluirlo en vuestros recursos para pacientes?

Saludos,
[NOMBRE]
AutaMedica
[EMAIL]`,
  },
  {
    contact: CONTACTS[4],
    subject:
      "Propuesta: Recurso educativo para pacientes en lista de espera",
    body: `Estimados,

Desde AutaMedica, trabajamos en mejorar acceso a salud mediante telemedicina. Hemos desarrollado un **recurso para pacientes en seguimiento**:

"Telemedicina Segura: Guía para Pacientes en Argentina"

Incluye:
- Cómo usar consultas virtuales de forma efectiva
- Protección de privacidad y datos
- Cuándo usarla y cuándo no
- Plataformas auditadas

**Propuesta:**
Que esté disponible para pacientes en vuestro sitio como recurso educativo.

¿Interesado?

Saludos,
[NOMBRE]
AutaMedica
[EMAIL]`,
  },
];

async function generateCampaign(name: string, role: string, email: string, phone: string) {
  // Create campaigns directory
  const campaignDir = join(process.cwd(), "campaigns");
  mkdirSync(campaignDir, { recursive: true });

  // Generate individual emails
  let emailsMarkdown = "# TIER 1 OUTREACH EMAILS - PERSONALIZADOS\n\n";

  const csvData: string[] = [
    "Organization,Contact Email,Subject,Status,Notes",
  ];

  TEMPLATES.forEach((template, index) => {
    const emailBody = template.body
      .replace(/\[NOMBRE\]/g, name)
      .replace(/\[CARGO\]/g, role)
      .replace(/\[EMAIL\]/g, email)
      .replace(/\[TELÉFONO\]/g, phone);

    emailsMarkdown += `## EMAIL ${index + 1}: ${template.contact.organization.toUpperCase()} (DA ${template.contact.da})\n\n`;
    emailsMarkdown += `**Para:** ${template.contact.email}\n`;
    emailsMarkdown += `**Subject:** ${template.subject}\n\n`;
    emailsMarkdown += `**Body:**\n\n${emailBody}\n\n---\n\n`;

    csvData.push(
      `"${template.contact.organization}","${template.contact.email}","${template.subject}","pending","DA: ${template.contact.da}"`
    );
  });

  // Write emails to file
  const emailsPath = join(campaignDir, "tier1-emails-generated.md");
  writeFileSync(emailsPath, emailsMarkdown);
  console.log(`✅ Emails personalizados: ${emailsPath}`);

  // Write CSV for email clients
  const csvPath = join(campaignDir, "tier1-contacts.csv");
  writeFileSync(csvPath, csvData.join("\n"));
  console.log(`✅ CSV para importar en cliente de correo: ${csvPath}`);

  // Generate press release with personalized contact
  const pressRelease = `COMUNICADO DE PRENSA

PARA DISTRIBUCIÓN INMEDIATA

---

Título: AutaMedica Expande Acceso a Especialistas en Argentina Through Telemedicine

BUENOS AIRES, ${new Date().toLocaleDateString("es-AR")} – AutaMedica, plataforma líder de telemedicina en Argentina, anuncia la expansión de su red de especialistas disponibles para consultas virtuales, alcanzando nuevas provincias y reduciendo tiempos de espera en un promedio de 80%.

HALLAZGOS CLAVE:
- En provincias, esperar un especialista puede tomar hasta 4-5 meses
- AutaMedica reduce esto a 24-48 horas de consulta disponible
- Acceso a más de 150 especialistas en todo el país
- Consultas desde \$800 ARS (vs \$2,000-5,000 presencial)

ACERCA DE AUTAMEDICA:
AutaMedica es una plataforma de telemedicina especializada en conectar pacientes con profesionales médicos certificados en múltiples disciplinas, con foco en compliance regulatorio (HIPAA, Ley 25.326 Argentina) y privacidad de datos clínicos.

DISPONIBILIDAD:
Contactar: partnerships@autamedica.com
Sitio: www.autamedica.com
Teléfono: ${phone}

Para consultas de prensa:
${name}
${role} en AutaMedica
Email: ${email}
Teléfono: ${phone}

---

PARA DISTRIBUIR VÍA:
- PR Newswire Argentina
- Comunicae
- EFE Press (Argentina)
- Costo estimado: \$400-600 USD
- ROI esperado: 3-5 backlinks de autoridad + cobertura médica

---
`;

  const pressReleasePath = join(campaignDir, "press-release.txt");
  writeFileSync(pressReleasePath, pressRelease);
  console.log(`✅ Press release listo: ${pressReleasePath}`);

  // Generate action plan
  const actionPlan = `# PLAN DE EJECUCIÓN TIER 1 LINK BUILDING

## 1️⃣ EMAILS DIRECTOS (Estimado: 3-5 links en 10-15 días)

### Paso 1: Preparación (Hoy)
- [ ] Copiar emails de \`campaigns/tier1-emails-generated.md\`
- [ ] Abrir tu cliente de correo favorito (Gmail, Outlook, Thunderbird)
- [ ] Importar contactos de \`campaigns/tier1-contacts.csv\`

### Paso 2: Envío (Mañana)
- [ ] Enviar a Tier 1 (DA 55+): CMA, Confederación Médica, INCUCAI
- [ ] Esperar 3 días para respuestas
- [ ] Enviar a Tier 2 (DA 50-52): SAC, FAC
- [ ] Usar BCC a tu email para trackear respuestas

### Paso 3: Follow-up (7 días después)
- [ ] Si no hay respuesta, enviar follow-up cordial
- [ ] Adjuntar material de ejemplo (guía, webinar details)
- [ ] Solicitar call con PM/Director

### Esperado:
- 1-2 links de colaboraciones directas
- 1-3 links de artículos/webinars publicados
- Leads para demos posteriores

---

## 2️⃣ PRESS RELEASE DISTRIBUTION (Estimado: 3-5 links en 5-10 días)

### Paso 1: Redacción
- [ ] Press release listo en \`campaigns/press-release.txt\`
- [ ] Personalizado con tu nombre, cargo, email, teléfono

### Paso 2: Distribución
Usar los siguientes servicios (presupuesto total \$400-600):

#### PR Newswire Argentina
- Sitio: https://www.prnewswire.com/
- Costo: ~\$200-250 USD
- Alcance: 500+ medios, 10-15 links esperados
- Tiempo: 4-8 horas publicación

#### Comunicae
- Sitio: https://www.comunicae.es/
- Costo: ~\$150 USD
- Alcance: Medios hispanohablantes, 3-5 links
- Tiempo: 24h publicación

#### EFE Press
- Sitio: https://www.efepresss.com/
- Costo: ~\$150 USD
- Alcance: Agencia oficial Argentina, alta autoridad
- Tiempo: 24-48h publicación

### Paso 3: Monitoreo
- [ ] Monitor en Google Search Console 3-5 días después
- [ ] Buscar nuevos referers en Analytics
- [ ] Verificar indexación de press release
- [ ] Registrar URLs en link database

### Esperado:
- 3-5 backlinks de alta autoridad
- Cobertura en 5-10 medios médicos
- Aumento de Domain Authority (propuesta: +2-3 DA points)

---

## 3️⃣ TIMELINE GLOBAL

**Semana 1:**
- Día 1-2: Envío de emails Tier 1
- Día 3-4: Distribución press release
- Día 5-7: Primeras respuestas esperadas

**Semana 2-3:**
- Follow-ups a no-responders
- Confirmación de artículos/webinars publicados
- Verificación de backlinks en GSC

**Semana 4+:**
- Consolidación de links
- Análisis de impacto en rankings
- Planificación Tier 2 (universidades, medios)

---

## 📊 MÉTRICAS DE ÉXITO

| Métrica | Meta | Realista |
|---------|------|----------|
| Links from DA 50+ | 5+ | 3-4 |
| Links from Press Distribution | 5+ | 3-4 |
| Artículos publicados | 3+ | 2 |
| Webinars confirmados | 1+ | 1 |
| DA improvement | +3 | +2 |
| Referral traffic from links | 50+ visits/mes | 20-30 |

---

## 💡 TIPS DE EJECUCIÓN

1. **Envía los emails MAÑANA MISMO.** Antes de las 10am tiene mejor open rate.
2. **Personaliza cada email** con algo específico de cada organización (reciente news, artículo que escribieron, etc.)
3. **Usa Bcc:** direccion-propia@autamedica.com para trackear respuestas automáticamente
4. **Press release:** distribuye el MISMO DÍA que envías emails (viernes NO, lunes-jueves SÍ)
5. **Después de respuesta positiva:** responde en 2 horas máximo
6. **Webinar:** once confirmado, publicitalo en redes sociales + newsletter

---

## 🚀 PRÓXIMOS PASOS POST TIER 1

Una vez completado Tier 1 (esperar 3-4 semanas):

1. **Tier 2 (Universidades de Medicina):**
   - UBA Facultad de Medicina
   - Universidades del interior
   - Colegios médicos provinciales

2. **Tier 3 (Content Marketing):**
   - Menciones en artículos de medios médicos
   - Guest posts en blogs de salud
   - Colaboraciones con influencers médicos

3. **Tier 4 (Partnerships):**
   - Clínicas privadas con sitios
   - Farmacias con portales pacientes
   - Apps de salud

---

Éxito con la campaña. 🎯

Contacto para dudas: ${email} (${phone})
`;

  const actionPlanPath = join(campaignDir, "ACTION-PLAN.md");
  writeFileSync(actionPlanPath, actionPlan);
  console.log(`✅ Plan de ejecución: ${actionPlanPath}`);

  // Summary
  console.log(`
╔════════════════════════════════════════════════════════════╗
║        CAMPAÑA TIER 1 LINK BUILDING LISTA PARA ENVIAR     ║
╚════════════════════════════════════════════════════════════╝

✅ GENERADO:
   1. ${emailsPath}
      → 5 emails personalizados listos para copiar/pegar

   2. ${csvPath}
      → Importa en tu cliente de correo (Gmail, Outlook, etc.)

   3. ${pressReleasePath}
      → Press release listo para distribuir

   4. ${actionPlanPath}
      → Timeline completo + tips de ejecución

📊 CONTACTOS OBJETIVO:
${CONTACTS.map((c) => `   • ${c.organization.padEnd(30)} (DA ${c.da}) → ${c.email}`).join("\n")}

⏱️  TIMELINE RECOMENDADO:
   • HOY: Leer plan de ejecución
   • MAÑANA: Enviar emails (Tier 1: CMA, Confederación, INCUCAI)
   • MISMO DÍA: Distribuir press release
   • DÍA 3-4: Enviar emails Tier 2 (SAC, FAC)
   • DÍA 7: Follow-ups

🎯 META: 3-5 backlinks de autoridad en 14 días

PRÓXIMO PASO: Abre ACTION-PLAN.md y sigue los pasos paso a paso.
  `);
}

// Main execution
const args = Bun.argv.slice(2);

if (args.length < 4) {
  console.error(`
❌ FALTAN ARGUMENTOS

Uso:
  bun scripts/tier1-campaign.ts "<Tu Nombre>" "<Tu Cargo>" "<tu@email.com>" "<+54-9-11-XXXX-XXXX>"

Ejemplo:
  bun scripts/tier1-campaign.ts "Eduardo García" "Founder & CEO" "edo@autamedica.com" "+54-9-11-1234-5678"

Esto generará:
  • 5 emails personalizados listos para enviar
  • CSV para importar contactos en tu cliente de correo
  • Press release personalizado
  • Plan de ejecución completo
  `);
  process.exit(1);
}

const [name, role, email, phone] = args;

console.log(`\n🔧 Generando campaña Tier 1 Link Building...\n`);
console.log(`   Nombre: ${name}`);
console.log(`   Cargo: ${role}`);
console.log(`   Email: ${email}`);
console.log(`   Teléfono: ${phone}\n`);

await generateCampaign(name, role, email, phone);

console.log(`\n✨ Campaña generada exitosamente en ./campaigns/\n`);
