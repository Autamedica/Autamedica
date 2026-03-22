import type { AnamnesisExtractionRequest, AnamnesisExtractionResult } from '@/lib/patients/types/anamnesis-extraction'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatList(items: string[], emptyLabel: string): string {
  if (items.length === 0) {
    return `<p class="empty">${escapeHtml(emptyLabel)}</p>`
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
}

function formatNullableValue(value: string | number | null | undefined, emptyLabel = 'Sin codificacion suficiente'): string {
  if (value == null || value === '') {
    return emptyLabel
  }

  return String(value)
}

function formatCodeLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function buildDefinitionList(entries: Array<{ label: string; value: string }>): string {
  return `
    <dl class="definition-list">
      ${entries
        .map(
          (entry) => `
            <div class="definition-row">
              <dt>${escapeHtml(entry.label)}</dt>
              <dd>${escapeHtml(entry.value)}</dd>
            </div>
          `,
        )
        .join('')}
    </dl>
  `
}

function buildAlertCards(
  alerts: Array<{ severity: 'low' | 'medium' | 'high'; code: string; message: string; sourceSections: string[] }>,
): string {
  if (alerts.length === 0) {
    return `<p class="empty">No se detectaron alertas de calidad o consistencia.</p>`
  }

  return `
    <div class="stack">
      ${alerts
        .map(
          (alert) => `
            <article class="alert-card alert-${escapeHtml(alert.severity)}">
              <header>
                <strong>${escapeHtml(formatCodeLabel(alert.code))}</strong>
                <span>${escapeHtml(alert.severity)}</span>
              </header>
              <p>${escapeHtml(alert.message)}</p>
              <small>Fuentes: ${escapeHtml(alert.sourceSections.join(', ') || 'sin seccion identificada')}</small>
            </article>
          `,
        )
        .join('')}
    </div>
  `
}

function buildBodySelectionCards(
  bodySelections: AnamnesisExtractionRequest['bodySelections'],
): string {
  if (bodySelections.length === 0) {
    return '<p class="empty">No se registraron selecciones anatomicas estructuradas en la anamnesis.</p>'
  }

  return `
    <div class="chip-grid">
      ${bodySelections
        .map(
          (selection) => `
            <article class="chip-card">
              <strong>${escapeHtml(selection.label)}</strong>
              <span>${escapeHtml(selection.symptomType)} · ${escapeHtml(selection.laterality)} · ${escapeHtml(selection.aspect)}</span>
              <small>Intensidad ${escapeHtml(String(selection.intensity))}/10</small>
            </article>
          `,
        )
        .join('')}
    </div>
  `
}

export function buildAnamnesisExtractionHtml(input: {
  patientLabel: string
  providerName: string
  modelName: string
  promptVersion: string
  request: AnamnesisExtractionRequest
  result: AnamnesisExtractionResult
}): string {
  const generatedAt = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date())

  const normalizedFields = input.result.normalizedOpenFields
  const normalizedGrid = buildDefinitionList([
    {
      label: 'Edad discretizada',
      value:
        normalizedFields.ageMonths != null
          ? `${normalizedFields.ageMonths} meses`
          : 'Sin codificacion suficiente',
    },
    {
      label: 'Categoria ocupacional',
      value: formatCodeLabel(formatNullableValue(normalizedFields.occupationCategory)),
    },
    {
      label: 'Antiguedad ocupacional',
      value:
        normalizedFields.occupationYears != null
          ? `${normalizedFields.occupationYears} anos`
          : 'Sin codificacion suficiente',
    },
    {
      label: 'Codigo de queja cardinal',
      value: formatCodeLabel(formatNullableValue(normalizedFields.chiefComplaintCode)),
    },
    {
      label: 'Fenotipo de dolor toracico',
      value: formatCodeLabel(formatNullableValue(normalizedFields.chestPainPhenotype)),
    },
    {
      label: 'Fenotipo de tos',
      value: formatCodeLabel(formatNullableValue(normalizedFields.coughPhenotype)),
    },
    {
      label: 'Causa de muerte paterna',
      value: formatCodeLabel(formatNullableValue(normalizedFields.fatherDeathCause)),
    },
    {
      label: 'Causa de muerte materna',
      value: formatCodeLabel(formatNullableValue(normalizedFields.motherDeathCause)),
    },
    {
      label: 'Familias farmacologicas',
      value:
        normalizedFields.medicationFamilies.length > 0
          ? normalizedFields.medicationFamilies.map(formatCodeLabel).join(', ')
          : 'Sin codificacion suficiente',
    },
    {
      label: 'Grupos de alergias',
      value:
        normalizedFields.allergyGroups.length > 0
          ? normalizedFields.allergyGroups.map(formatCodeLabel).join(', ')
          : 'Sin codificacion suficiente',
    },
    {
      label: 'Red flags codificadas',
      value:
        normalizedFields.redFlagCodes.length > 0
          ? normalizedFields.redFlagCodes.map(formatCodeLabel).join(', ')
          : 'Sin red flags codificadas',
    },
  ])

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Extraccion estructurada de anamnesis</title>
    <style>
      :root { color-scheme: light; font-family: "Segoe UI", Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px; background: #f5f1e8; color: #1c1917; }
      .page { max-width: 1120px; margin: 0 auto; background: #fff; border-radius: 20px; padding: 36px; box-shadow: 0 18px 40px rgba(28, 25, 23, 0.08); }
      .actions { display: flex; gap: 12px; margin-bottom: 24px; }
      .actions button { border: 0; border-radius: 999px; padding: 10px 16px; cursor: pointer; background: #0f766e; color: white; font-weight: 600; }
      .actions button.secondary { background: #e7e5e4; color: #1c1917; }
      .eyebrow { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px; background: #dbeafe; color: #1d4ed8; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
      h1 { margin: 16px 0 8px; font-size: 34px; line-height: 1.1; }
      .lede { margin: 0 0 24px; font-size: 17px; line-height: 1.6; color: #44403c; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 24px 0 28px; }
      .meta-card { border: 1px solid #e7e5e4; border-radius: 14px; padding: 14px 16px; background: #fafaf9; }
      .meta-card strong { display: block; margin-bottom: 6px; color: #57534e; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
      .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; }
      .section { margin-top: 22px; padding-top: 22px; border-top: 1px solid #e7e5e4; }
      .card { border: 1px solid #e7e5e4; border-radius: 16px; padding: 18px; background: #fcfcfb; }
      .card h2, .section h2 { margin: 0 0 14px; font-size: 22px; }
      .subgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
      .chip-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
      .chip-card { border: 1px solid #e7e5e4; border-radius: 16px; padding: 14px 16px; background: #fafaf9; }
      .chip-card strong, .chip-card span, .chip-card small { display: block; }
      .chip-card span { margin-top: 8px; color: #57534e; font-size: 14px; }
      .chip-card small { margin-top: 6px; color: #78716c; }
      .definition-list { margin: 0; display: grid; gap: 10px; }
      .definition-row { padding: 12px 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
      .definition-row dt { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: #475569; text-transform: uppercase; }
      .definition-row dd { margin: 0; line-height: 1.45; }
      .stack { display: grid; gap: 12px; }
      .alert-card { border-radius: 14px; padding: 14px 16px; border: 1px solid #e7e5e4; }
      .alert-card header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .alert-low { background: #f8fafc; }
      .alert-medium { background: #fff7ed; border-color: #fdba74; }
      .alert-high { background: #fef2f2; border-color: #fca5a5; }
      ul { margin: 0; padding-left: 22px; }
      li { margin-bottom: 10px; line-height: 1.55; }
      .pill-list { display: flex; flex-wrap: wrap; gap: 8px; }
      .pill { display: inline-flex; padding: 8px 12px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 13px; font-weight: 600; }
      .empty { margin: 0; color: #78716c; line-height: 1.5; }
      .narrative { padding: 18px; border-radius: 16px; background: #f8fafc; border-left: 5px solid #0f766e; }
      .narrative p { margin: 0; line-height: 1.65; }
      .footer-note { margin-top: 28px; padding-top: 20px; border-top: 1px dashed #d6d3d1; color: #57534e; font-size: 14px; line-height: 1.5; }
      @media (max-width: 920px) { body { padding: 16px; } .page { padding: 24px; } .grid { grid-template-columns: 1fr; } }
      @media print { body { background: white; padding: 0; } .page { box-shadow: none; border-radius: 0; padding: 0; } .actions { display: none; } }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="actions">
        <button onclick="window.print()">Imprimir / guardar como PDF</button>
        <button class="secondary" onclick="window.close()">Cerrar</button>
      </div>

      <span class="eyebrow">Salida estructurada del extractor</span>
      <h1>Extraccion de anamnesis evaluable</h1>
      <p class="lede">Vista HTML para auditar como el modelo traduce el relato del paciente a una estructura clinica tipada y finita.</p>

      <div class="meta">
        <div class="meta-card">
          <strong>Paciente</strong>
          <span>${escapeHtml(input.patientLabel)}</span>
        </div>
        <div class="meta-card">
          <strong>Proveedor</strong>
          <span>${escapeHtml(input.providerName)}</span>
        </div>
        <div class="meta-card">
          <strong>Modelo</strong>
          <span>${escapeHtml(input.modelName)}</span>
        </div>
        <div class="meta-card">
          <strong>Prompt</strong>
          <span>${escapeHtml(input.promptVersion)}</span>
        </div>
        <div class="meta-card">
          <strong>Generado</strong>
          <span>${escapeHtml(generatedAt)}</span>
        </div>
        <div class="meta-card">
          <strong>Estado anamnesis</strong>
          <span>${escapeHtml(input.request.patient.anamnesisStatus)}</span>
        </div>
      </div>

      <div class="grid">
        <div>
          <section class="card">
            <h2>Queja cardinal y enfermedad actual</h2>
            ${buildDefinitionList([
              { label: 'Texto crudo dominante', value: formatNullableValue(input.result.chiefComplaint.rawText) },
              { label: 'Redaccion medica normalizada', value: formatNullableValue(input.result.chiefComplaint.normalizedMedicalText) },
              { label: 'Contextual mismatch', value: input.result.chiefComplaint.contextualMismatch ? 'Si' : 'No' },
              { label: 'Fuentes', value: input.result.chiefComplaint.sourceSections.length > 0 ? input.result.chiefComplaint.sourceSections.join(', ') : 'Sin fuentes identificadas' },
              { label: 'Cronologia', value: formatNullableValue(input.result.presentIllness.chronology) },
              { label: 'Severidad', value: formatNullableValue(input.result.presentIllness.severity) },
            ])}
            <div class="section">
              <h2>Narrativa clinica</h2>
              <div class="narrative">
                <p>${escapeHtml(input.result.presentIllness.clinicalNarrative)}</p>
              </div>
            </div>
          </section>

          <section class="section">
            <h2>Evidencia anatomica estructurada</h2>
            <div class="card">
              ${buildBodySelectionCards(input.request.bodySelections)}
            </div>
          </section>

          <section class="section">
            <h2>Normalizacion ontologica</h2>
            <div class="card">
              ${normalizedGrid}
            </div>
          </section>

          <section class="section">
            <h2>Antecedentes y revision por sistemas</h2>
            <div class="subgrid">
              <article class="card">
                <h2>Antecedentes personales</h2>
                <h3>Fisiologicos</h3>
                ${formatList(input.result.personalHistory.physiological, 'Sin hallazgos fisiologicos estructurados.')}
                <h3>Patologicos</h3>
                ${formatList(input.result.personalHistory.pathological, 'Sin antecedentes patologicos estructurados.')}
                <h3>Habitos y contexto</h3>
                ${formatList(input.result.personalHistory.lifestyleAndContext, 'Sin contexto o habitos estructurados.')}
              </article>
              <article class="card">
                <h2>Antecedentes familiares</h2>
                ${formatList(input.result.familyHistory, 'Sin antecedentes familiares estructurados.')}
              </article>
              <article class="card">
                <h2>Cardiovascular</h2>
                ${formatList(input.result.reviewOfSystems.cardiovascular, 'Sin hallazgos cardiovasculares estructurados.')}
              </article>
              <article class="card">
                <h2>Respiratorio</h2>
                ${formatList(input.result.reviewOfSystems.respiratory, 'Sin hallazgos respiratorios estructurados.')}
              </article>
              <article class="card">
                <h2>Digestivo</h2>
                ${formatList(input.result.reviewOfSystems.digestive, 'Sin hallazgos digestivos estructurados.')}
              </article>
              <article class="card">
                <h2>Genitourinario</h2>
                ${formatList(input.result.reviewOfSystems.genitourinary, 'Sin hallazgos genitourinarios estructurados.')}
              </article>
            </div>
          </section>
        </div>

        <aside class="stack">
          <section class="card">
            <h2>Integridad del dato</h2>
            ${buildDefinitionList([
              { label: 'Secciones bien cubiertas', value: input.result.argenteCoverage.adequatelyCovered.length > 0 ? input.result.argenteCoverage.adequatelyCovered.join(', ') : 'Ninguna marcada' },
              { label: 'Secciones debiles o faltantes', value: input.result.argenteCoverage.weakOrMissing.length > 0 ? input.result.argenteCoverage.weakOrMissing.join(', ') : 'Ninguna marcada' },
            ])}
            <div class="section">
              <h2>Contradicciones</h2>
              ${formatList(input.result.dataIntegrity.contradictions, 'Sin contradicciones detectadas.')}
            </div>
            <div class="section">
              <h2>Posibles misclicks</h2>
              ${formatList(input.result.dataIntegrity.possibleMiscalicks, 'Sin misclicks probables detectados.')}
            </div>
            <div class="section">
              <h2>Relatos duplicados</h2>
              ${formatList(input.result.dataIntegrity.duplicatedNarratives, 'Sin duplicaciones detectadas.')}
            </div>
            <div class="section">
              <h2>Datos criticos faltantes</h2>
              ${formatList(input.result.dataIntegrity.missingCriticalData, 'Sin faltantes criticos detectados.')}
            </div>
          </section>

          <section class="card">
            <h2>Alertas de calidad</h2>
            ${buildAlertCards(input.result.qualityAlerts)}
          </section>

          <section class="card">
            <h2>Safety flags</h2>
            ${
              input.result.safetyFlags.length > 0
                ? `<div class="pill-list">${input.result.safetyFlags
                    .map((flag) => `<span class="pill">${escapeHtml(flag)}</span>`)
                    .join('')}</div>`
                : '<p class="empty">Sin safety flags textuales en esta corrida.</p>'
            }
          </section>

          <section class="card">
            <h2>Repreguntas clinicas</h2>
            ${formatList(input.result.clinicianQuestions, 'Sin repreguntas clinicas sugeridas.')}
          </section>

          <section class="card">
            <h2>Next questions</h2>
            ${
              input.result.nextQuestions.length > 0
                ? `
                  <div class="stack">
                    ${input.result.nextQuestions
                      .map(
                        (question) => `
                          <article class="alert-card">
                            <header>
                              <strong>${escapeHtml(question.priority)}</strong>
                              <span>${escapeHtml(question.targetSection)}</span>
                            </header>
                            <p>${escapeHtml(question.question)}</p>
                            <small>Tipo: ${escapeHtml(question.questionType)}. Razon: ${escapeHtml(question.rationale)}</small>
                          </article>
                        `,
                      )
                      .join('')}
                  </div>
                `
                : '<p class="empty">Sin preguntas sugeridas para la siguiente iteracion.</p>'
            }
          </section>
        </aside>
      </div>

      <p class="footer-note">
        Esta vista no reemplaza la validacion medica. Sirve para auditar si el extractor recupera la queja cardinal,
        separa contexto de sintoma, preserva la cronologia y traduce el relato a un espacio finito tipado.
      </p>
    </main>
  </body>
</html>`
}
