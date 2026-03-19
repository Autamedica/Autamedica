import type { Json } from '@autamedica/types';

export interface AnamnesisSectionRecord {
  section: string;
  data: Json;
  completed?: boolean | null;
  updated_at?: string | null;
}

export interface AnamnesisSummarySection {
  title: string;
  items: string[];
}

export interface AnamnesisSummary {
  headline: string;
  narrative: string[];
  sections: AnamnesisSummarySection[];
  completedSections: number;
  lastUpdatedAt: string | null;
}

function asRecord(value: Json | undefined): Record<string, Json> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }

  return {};
}

function asBoolean(value: Json | undefined): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return null;
}

function asString(value: Json | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: Json | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asStringList(value: Json | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter((item): item is string => item != null);
}

function appendItem(target: string[], value: string | null | undefined): void {
  if (!value) return;
  target.push(value);
}

function joinList(values: string[]): string | null {
  return values.length > 0 ? values.join(', ') : null;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildStepSummary(section: AnamnesisSectionRecord): string[] {
  const data = asRecord(section.data);
  const items: string[] = [];

  switch (section.section) {
    case 'edad': {
      const age = asNumber(data.edad);
      const birthDate = asString(data.fecha_nacimiento);
      appendItem(items, age != null ? `Edad reportada: ${age} años.` : null);
      appendItem(items, birthDate ? `Fecha de nacimiento: ${birthDate}.` : null);
      break;
    }
    case 'ocupacion': {
      const occupation = asString(data.ocupacion_actual);
      const years = asNumber(data['años_ocupacion']);
      const risks = joinList(asStringList(data.exposicion_riesgos));
      appendItem(items, occupation ? `Actividad actual: ${occupation}.` : null);
      appendItem(items, years != null ? `Antigüedad laboral: ${years} años.` : null);
      appendItem(items, risks ? `Exposiciones laborales referidas: ${risks}.` : null);
      break;
    }
    case 'motivo_consulta': {
      const symptom = asString(data.sintoma_principal);
      const started = asString(data.cuando_empezo);
      const intensity = asNumber(data.intensidad_sintoma);
      appendItem(items, symptom ? `Motivo principal: ${symptom}.` : null);
      appendItem(items, started ? `Inicio de síntomas: ${started}.` : null);
      appendItem(items, intensity != null ? `Intensidad referida: ${intensity}/10.` : null);
      break;
    }
    case 'enfermedades_previas': {
      const conditions = joinList(asStringList(data.enfermedades_cronicas));
      appendItem(items, conditions ? `Antecedentes personales: ${conditions}.` : 'No refiere antecedentes relevantes en esta sección.');
      break;
    }
    case 'medicamentos': {
      const takesMedication = asBoolean(data.toma_medicamentos);
      const list = asString(data.lista_medicamentos);
      appendItem(
        items,
        takesMedication === false
          ? 'Niega medicación actual.'
          : takesMedication === true
            ? 'Refiere medicación actual.'
            : null,
      );
      appendItem(items, list ? `Detalle de medicación: ${list}.` : null);
      break;
    }
    case 'alergias': {
      const hasAllergies = asBoolean(data.tiene_alergias);
      const list = asString(data.lista_alergias);
      appendItem(
        items,
        hasAllergies === false
          ? 'Niega alergias conocidas.'
          : hasAllergies === true
            ? 'Refiere alergias o reacciones previas.'
            : null,
      );
      appendItem(items, list ? `Detalle de alergias/reacciones: ${list}.` : null);
      break;
    }
    case 'antecedentes_familiares': {
      const father = joinList(asStringList(data.padre_enfermedades));
      const mother = joinList(asStringList(data.madre_enfermedades));
      const siblings = joinList(asStringList(data.hermanos_enfermedades));
      appendItem(items, father ? `Antecedentes paternos: ${father}.` : null);
      appendItem(items, mother ? `Antecedentes maternos: ${mother}.` : null);
      appendItem(items, siblings ? `Antecedentes en hermanos: ${siblings}.` : null);
      break;
    }
    case 'habitos': {
      const smokes = asBoolean(data.fuma);
      const alcohol = asBoolean(data.alcohol);
      const exercise = asBoolean(data.ejercicio);
      const sleep = asNumber(data.horas_sueno);
      const diet = asString(data.dieta);
      appendItem(items, smokes === true ? 'Refiere tabaquismo.' : smokes === false ? 'Niega tabaquismo actual.' : null);
      appendItem(items, alcohol === true ? 'Refiere consumo de alcohol.' : alcohol === false ? 'Niega consumo de alcohol.' : null);
      appendItem(items, exercise === true ? 'Realiza actividad física.' : exercise === false ? 'No realiza actividad física habitual.' : null);
      appendItem(items, sleep != null ? `Sueño: ${sleep} horas por noche.` : null);
      appendItem(items, diet ? `Percepción de la dieta: ${diet}.` : null);
      break;
    }
    case 'cardiovascular':
    case 'respiratorio':
    case 'digestivo':
    case 'genitourinario': {
      const symptoms = joinList(
        Object.entries(data)
          .filter(([key, value]) => key.startsWith('sintomas_') && Array.isArray(value))
          .flatMap(([, value]) => asStringList(value))
      );
      const details = joinList(
        Object.entries(data)
          .filter(([key, value]) => key.endsWith('_detalle') || key === 'dolor_pecho_detalle' || key === 'tos_detalle')
          .map(([, value]) => asString(value))
          .filter((value): value is string => value != null)
      );
      const title = sentenceCase(section.section);
      appendItem(items, symptoms ? `${title}: ${symptoms}.` : `Sin hallazgos destacados en ${title.toLowerCase()}.`);
      appendItem(items, details ? `Aclaraciones: ${details}.` : null);
      break;
    }
    case 'resumen_final': {
      const confirm = asBoolean(data.confirma_informacion);
      const comments = asString(data.comentarios_adicionales);
      appendItem(items, confirm === true ? 'Paciente confirma la veracidad de la información reportada.' : null);
      appendItem(items, comments ? `Comentarios adicionales: ${comments}.` : null);
      break;
    }
    default:
      break;
  }

  return items;
}

export function buildAnamnesisSummary(sections: AnamnesisSectionRecord[]): AnamnesisSummary {
  const normalizedSections = sections
    .map((section) => ({
      ...section,
      items: buildStepSummary(section),
    }))
    .filter((section) => section.items.length > 0);

  const narrative = normalizedSections.flatMap((section) => section.items);
  const lastUpdatedAt = sections.reduce<string | null>((latest, section) => {
    if (!section.updated_at) return latest;
    if (!latest) return section.updated_at;
    return new Date(section.updated_at).getTime() > new Date(latest).getTime() ? section.updated_at : latest;
  }, null);

  return {
    headline: 'Resumen clínico redactado automáticamente a partir de las respuestas del paciente.',
    narrative,
    sections: normalizedSections.map((section) => ({
      title: sentenceCase(section.section.replace(/_/g, ' ')),
      items: section.items,
    })),
    completedSections: sections.filter((section) => section.completed === true).length,
    lastUpdatedAt,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildAnamnesisExportHtml(input: {
  patientLabel: string;
  status: string;
  privacyAccepted: boolean;
  summary: AnamnesisSummary;
}): string {
  const generatedAt = new Date().toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const sectionsHtml = input.summary.sections
    .map(
      (section) => `
        <section class="section">
          <h2>${escapeHtml(section.title)}</h2>
          <ul>
            ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </section>
      `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Resumen de anamnesis</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
        background: #f6f3eb;
        color: #1f2937;
      }
      .page {
        max-width: 900px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 18px;
        padding: 32px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
      }
      h1, h2 {
        margin: 0 0 12px;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin: 24px 0;
      }
      .meta-card {
        border: 1px solid #d6d3d1;
        border-radius: 12px;
        padding: 12px 14px;
        background: #fafaf9;
      }
      .summary {
        border-left: 4px solid #0284c7;
        padding: 16px;
        background: #f0f9ff;
        border-radius: 12px;
        margin-bottom: 24px;
      }
      .section {
        margin-top: 24px;
      }
      ul {
        padding-left: 18px;
      }
      li {
        margin-bottom: 8px;
        line-height: 1.45;
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
      }
      .actions button {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        cursor: pointer;
        background: #0f766e;
        color: white;
        font-weight: 600;
      }
      .actions button.secondary {
        background: #e7e5e4;
        color: #1c1917;
      }
      @media print {
        body {
          background: white;
          padding: 0;
        }
        .page {
          box-shadow: none;
          padding: 0;
        }
        .actions {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="actions">
        <button onclick="window.print()">Descargar PDF</button>
        <button class="secondary" onclick="window.close()">Cerrar</button>
      </div>
      <h1>Resumen de anamnesis</h1>
      <p>${escapeHtml(input.summary.headline)}</p>

      <div class="meta">
        <div class="meta-card"><strong>Paciente</strong><br />${escapeHtml(input.patientLabel)}</div>
        <div class="meta-card"><strong>Estado</strong><br />${escapeHtml(input.status)}</div>
        <div class="meta-card"><strong>Compartida con médicos</strong><br />${input.privacyAccepted ? 'Sí' : 'No'}</div>
        <div class="meta-card"><strong>Generado</strong><br />${escapeHtml(generatedAt)}</div>
      </div>

      <section class="summary">
        <strong>Síntesis narrativa</strong>
        <ul>
          ${input.summary.narrative.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </section>

      ${sectionsHtml}
    </main>
  </body>
</html>`;
}
