/**
 * Test: Prompt v4 (nivel R3) vs v3 — mismo caso de María González
 * Evalúa si el cruce entre secciones y el razonamiento integrador mejoran el output.
 *
 * Uso: cd ~/Autamedica && bun scripts/test-gemini-v4-r3.ts
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  ?? Bun.env.GEMINI_API_KEY
  ?? (() => { throw new Error('GEMINI_API_KEY no configurada') })()

const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const PACIENTE = {
  version: 'anamnesis_extraction_v2',
  purpose: 'extract_structured_anamnesis_without_diagnosis',
  patient: {
    patientId: 'test-demo-001',
    patientLabel: 'María González',
    anamnesisStatus: 'completed',
    privacyAccepted: true,
  },
  guardrails: [
    'No emitir diagnosticos ni diferenciales.',
    'No indicar tratamiento ni conducta terapeutica.',
    'No agregar sintomas ni banderas rojas que no esten en la evidencia.',
    'No sugerir estudios complementarios.',
  ],
  deterministicSummary: 'Paciente femenina, 42 años. Contadora, 15 años. Cefalea frecuente 3 meses, predominio vespertino. HTA hace 2 años. Enalapril 10mg/día adherencia irregular. Automedicación ibuprofeno 400mg 2-3x/sem. Alergia penicilina (anafilaxia). Padre fallecido IAM 65 años. Madre HTA 70 años. Abuela materna DBT2. Café 3-4/día. Sedentaria. Acidez post-AINEs.',
  sourceSections: [
    { section: 'filiacion', data: { fecha_nacimiento: '1984-03-15', ocupacion_actual: 'Contadora en estudio contable', anos_en_puesto: 15, tipo_trabajo: 'sedentario', exposiciones_laborales: 'Pantalla 10+ hs/día, estrés fiscal' }, completed: true },
    { section: 'motivo_consulta', data: { motivo_principal: 'Dolor de cabeza frecuente', descripcion_detallada: 'Desde hace 3 meses tengo dolores de cabeza casi todos los días, sobre todo a la tarde después de estar mucho rato frente a la computadora. Siento como una presión en la nuca que se va hacia las sienes. Los fines de semana mejora bastante.', desde_cuando: '3 meses', intentos_previos: 'Ibuprofeno 400mg me calma por unas horas pero vuelve. Paracetamol no me hace tanto efecto.' }, completed: true },
    { section: 'antecedentes_personales', data: { enfermedades_previas: 'HTA diagnosticada hace 2 años en control de rutina.', cirugias: 'Cesárea 2015', internaciones: 'Solo cesárea' }, completed: true },
    { section: 'medicamentos', data: { toma_medicamentos: true, lista_medicamentos: 'Enalapril 10mg, 1x/día a la mañana. A veces se me olvida los fines de semana.', automedicacion: 'Ibuprofeno 400mg para dolor de cabeza, 2-3x/semana. Paracetamol 500mg cuando no tengo ibuprofeno.' }, completed: true },
    { section: 'alergias', data: { tiene_alergias: true, lista_alergias: 'Penicilina: ronchas en todo el cuerpo, hinchazón de labios, costaba respirar. Me llevaron a la guardia.' }, completed: true },
    { section: 'antecedentes_familiares', data: { padre: 'Fallecido a los 65 de un infarto. Tenía presión alta y colesterol.', madre: 'Viva, 70 años, hipertensa. Operada de vesícula.', hermanos: 'Un hermano, 38, sano.', enfermedades_familiares: 'Padre y madre hipertensos. Abuela materna diabética tipo 2.' }, completed: true },
    { section: 'habitos', data: { tabaco: 'No fumo, nunca fumé.', alcohol: 'Social, una copa de vino los fines de semana.', cafe: '3 tazas por día, a veces 4 con mucho trabajo.', actividad_fisica: 'Sedentaria. No hago ejercicio.', sueno: '6-7 horas, me cuesta dormirme a veces.', alimentacion: 'Bastante bien pero como rápido. Mucho delivery.' }, completed: true },
    { section: 'cardiovascular', data: { dolor_pecho: false, palpitaciones: false, disnea_esfuerzo: false, edemas: false, sincope: false }, completed: true },
    { section: 'respiratorio', data: { tos: false, expectoracion: false, disnea: false, sibilancias: false }, completed: true },
    { section: 'digestivo', data: { nauseas: false, vomitos: false, acidez: true, dolor_abdominal: false, cambio_habito_intestinal: false, observaciones: 'Acidez cuando tomo mucho ibuprofeno.' }, completed: true },
    { section: 'genitourinario', data: { disuria: false, hematuria: false, frecuencia_urinaria: 'normal', ciclo_menstrual: 'Regular, cada 28-30 días.' }, completed: true },
  ],
  bodySelections: [],
  clarificationTurns: [
    { question: 'En una escala del 1 al 10, ¿qué intensidad suele alcanzar su dolor de cabeza?', answer: 'Generalmente un 6 o 7. Cuando es fuerte llega a 8 y no puedo concentrarme, tengo que cerrar los ojos.' },
    { question: '¿Cuánto tiempo dura aproximadamente si no toma medicación?', answer: 'Si no tomo nada me puede durar toda la tarde, unas 4-5 horas. A veces me acuesto con el dolor y al otro día ya no lo tengo.' },
    { question: '¿El dolor se acompaña de náuseas, vómitos, molestia con la luz o con los ruidos?', answer: 'Sí, cuando es más fuerte me molesta la luz, sobre todo la de la pantalla. Náuseas a veces, pero nunca vomité. El ruido no me molesta particularmente.' },
  ],
}

// Prompt v4 — nivel R3
const SYSTEM_PROMPT_V4 = [
  'Version del prompt: argente_interrogator_v4.',
  'Rol: residente de tercer ano (R3) de medicina interna realizando la extraccion semiologica de una anamnesis para soporte interno medico, siguiendo la logica de Argente-Alvarez.',
  '',
  'Mision: convertir datos crudos del formulario y texto libre del paciente en una estructura semiologica auditable Y realizar un analisis integrador entre secciones, identificando relaciones clinicamente relevantes entre hallazgos de diferentes secciones.',
  '',
  'Prohibiciones absolutas:',
  '- No emitir diagnosticos, diferenciales, probabilidades diagnosticas ni tratamientos.',
  '- No agregar sintomas, antecedentes, cronologias ni banderas rojas que no esten en la evidencia provista.',
  '- No completar huecos con sentido comun medico.',
  '- No sugerir estudios complementarios ni conductas terapeuticas.',
  '',
  'Reglas de extraccion:',
  '1. Usa solo el JSON provisto.',
  '2. Distingue siempre hechos, inferencias operativas y datos faltantes.',
  '3. Si el campo inicial de motivo de consulta describe contexto o desencadenante y la queja cardinal aparece despues, rescata la queja cardinal y marca contextualMismatch=true.',
  '4. Si el mismo relato libre aparece repetido en multiples aparatos o sistemas, consolidalo una sola vez y marca duplicacion en dataIntegrity.duplicatedNarratives.',
  '5. Si aparece un hallazgo aislado sin corroboracion o con alta probabilidad de misclick, no lo trates como hecho firme: pasalo a qualityAlerts y dataIntegrity.possibleMiscalicks.',
  '6. La enfermedad actual debe quedar redactada como narrativa clinica neutra, cronologica y verificable, sin diagnostico.',
  '7. La salida debe cubrir, con honestidad, estas secciones Argente: datos personales, motivo de consulta, enfermedad actual, antecedentes personales, antecedentes familiares e interrogatorio por sistemas.',
  '8. Si una seccion no esta suficientemente sustentada por los datos, declarala en argenteCoverage.weakOrMissing.',
  '9. Debes completar normalizedOpenFields usando las categorias cerradas del schema. Si no hay evidencia, usa null o [].',
  '10. chiefComplaintCode debe reflejar la queja cardinal clinica dominante.',
  '11. redFlagCodes solo puede incluir banderas rojas explicitamente sustentadas por la evidencia.',
  '12. Si clarificationTurns esta presente, tratar sus respuestas como evidencia complementaria prioritaria.',
  '13. Si una aclaracion resuelve una seccion debil, reducir weakOrMissing y actualizar nextQuestions.',
  '14. bodySelections es evidencia anatomica deterministica. Usala como fuente prioritaria.',
  '15. Si relato libre y bodySelections no coinciden, marca la discrepancia.',
  '',
  'Reglas de razonamiento integrador (nivel R3):',
  '16. CRUCE ENTRE SECCIONES: Despues de extraer cada seccion, cruza activamente los hallazgos entre ellas. Si un dato de medicamentos es relevante para el motivo de consulta, si un antecedente familiar tiene relacion con la enfermedad actual, si un habito impacta un hallazgo por sistemas — explicita la relacion en clinicalCrossReferences.',
  '17. Cada crossReference debe tener: las secciones que conecta (sourceSections), la observacion clinica (observation), y el nivel de relevancia (relevance: critical/high/medium). Ejemplo: medicacion + motivo_consulta = "uso frecuente de AINEs (2-3/sem x 3 meses) coincide temporalmente con cefalea cronica — evaluar cefalea por abuso de analgesicos".',
  '18. INTERROGATORIO DIRIGIDO: Las nextQuestions NO deben ser genericas. Deben ser preguntas que un R3 haria para cerrar un razonamiento clinico especifico. Si el motivo de consulta es cefalea, pregunta por aura, relacion con ciclo menstrual, cambios posturales, horario. Si hay HTA, pregunta por valores recientes.',
  '19. clinicianQuestions debe incluir las preguntas que un residente plantearia al medico de planta durante el pase — no las que le haria al paciente. Son preguntas de razonamiento clinico.',
  '20. CARACTERIZACION SEMIOLOGICA COMPLETA: Para el motivo de consulta principal, siempre intentar completar los 8 atributos de Argente (ALICIADO): Aparicion, Localizacion, Intensidad, Caracter, Irradiacion, Atenuantes, Desencadenantes, Otros sintomas asociados. Si falta algun atributo, listarlo en missingData.',
  '21. Responde exclusivamente en JSON valido y estricto.',
].join(' ')

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    normalizedOpenFields: {
      type: 'object',
      properties: {
        ageMonths: { type: ['integer', 'null'] },
        occupationCategory: { type: ['string', 'null'] },
        chiefComplaintCode: { type: ['string', 'null'] },
        medicationFamilies: { type: 'array', items: { type: 'string' } },
        allergyGroups: { type: 'array', items: { type: 'string' } },
        fatherDeathCause: { type: ['string', 'null'] },
        motherDeathCause: { type: ['string', 'null'] },
        redFlagCodes: { type: 'array', items: { type: 'string' } },
      },
    },
    chiefComplaint: {
      type: 'object',
      properties: {
        rawText: { type: ['string', 'null'] },
        normalizedMedicalText: { type: ['string', 'null'] },
        contextualMismatch: { type: 'boolean' },
      },
    },
    presentIllness: {
      type: 'object',
      properties: {
        chronology: { type: ['string', 'null'] },
        severity: { type: ['string', 'null'] },
        clinicalNarrative: { type: 'string' },
        associatedSymptoms: { type: 'array', items: { type: 'string' } },
        aggravatingFactors: { type: 'array', items: { type: 'string' } },
        relievingFactors: { type: 'array', items: { type: 'string' } },
        treatmentsTried: { type: 'array', items: { type: 'string' } },
        missingData: { type: 'array', items: { type: 'string' } },
      },
    },
    personalHistory: {
      type: 'object',
      properties: {
        physiological: { type: 'array', items: { type: 'string' } },
        pathological: { type: 'array', items: { type: 'string' } },
        lifestyleAndContext: { type: 'array', items: { type: 'string' } },
      },
    },
    familyHistory: { type: 'array', items: { type: 'string' } },
    reviewOfSystems: {
      type: 'object',
      properties: {
        cardiovascular: { type: 'array', items: { type: 'string' } },
        respiratory: { type: 'array', items: { type: 'string' } },
        digestive: { type: 'array', items: { type: 'string' } },
        genitourinary: { type: 'array', items: { type: 'string' } },
      },
    },
    qualityAlerts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string' },
          message: { type: 'string' },
          sourceSections: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    argenteCoverage: {
      type: 'object',
      properties: {
        adequatelyCovered: { type: 'array', items: { type: 'string' } },
        weakOrMissing: { type: 'array', items: { type: 'string' } },
      },
    },
    dataIntegrity: {
      type: 'object',
      properties: {
        contradictions: { type: 'array', items: { type: 'string' } },
        possibleMiscalicks: { type: 'array', items: { type: 'string' } },
        duplicatedNarratives: { type: 'array', items: { type: 'string' } },
        missingCriticalData: { type: 'array', items: { type: 'string' } },
      },
    },
    clinicalCrossReferences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceSections: { type: 'array', items: { type: 'string' } },
          observation: { type: 'string' },
          relevance: { type: 'string', enum: ['critical', 'high', 'medium'] },
        },
      },
    },
    clinicianQuestions: { type: 'array', items: { type: 'string' } },
    nextQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'string' },
          targetSection: { type: 'string' },
          questionType: { type: 'string' },
          question: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    safetyFlags: { type: 'array', items: { type: 'string' } },
  },
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║  TEST: Prompt v4 (R3) — Razonamiento integrador + ALICIADO      ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

  const t0 = performance.now()
  console.log('Enviando a Gemini...')

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY as string },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT_V4 }] },
      contents: [{ role: 'user', parts: [{ text: [
        'DATOS DEL PACIENTE (JSON) — CHECKPOINT FINAL:',
        JSON.stringify(PACIENTE),
        '',
        'SCHEMA DE RESPUESTA (JSON Schema):',
        JSON.stringify(RESPONSE_SCHEMA),
        '',
        'Responde UNICAMENTE con JSON valido.',
      ].join('\n') }] }],
      generationConfig: { temperature: 0, seed: 1, responseMimeType: 'application/json' },
    }),
  })

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)

  if (!res.ok) {
    console.error(`❌ ${res.status}:`, await res.json().catch(() => ({})))
    process.exit(1)
  }

  const payload = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
  }
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) { console.error('❌ Sin texto'); process.exit(1) }

  const r = JSON.parse(text)
  const tok = payload.usageMetadata
  console.log(`✓ ${elapsed}s | ${tok?.promptTokenCount}+${tok?.candidatesTokenCount}=${tok?.totalTokenCount} tokens\n`)

  // ─── ENFERMEDAD ACTUAL ─────────────────────────────────────────────
  console.log('═'.repeat(70))
  console.log('  ENFERMEDAD ACTUAL (narrativa R3)')
  console.log('═'.repeat(70))
  const words = (r.presentIllness?.clinicalNarrative ?? '').split(' ')
  let line = '  '
  for (const w of words) {
    if (line.length + w.length > 72) { console.log(line); line = '  ' + w }
    else line += (line.trim() ? ' ' : '') + w
  }
  if (line.trim()) console.log(line)

  // ALICIADO check
  console.log('\n── ALICIADO (8 atributos de Argenté) ─────────────────────────────')
  const pi = r.presentIllness ?? {}
  const aliciado = [
    { attr: 'Aparición', present: Boolean(pi.chronology) },
    { attr: 'Localización', present: (pi.clinicalNarrative ?? '').match(/occipital|nuca|sien|temporal/i) },
    { attr: 'Intensidad', present: (pi.severity ?? '').match(/\d/) },
    { attr: 'Carácter', present: (pi.clinicalNarrative ?? '').match(/presi[oó]n|puls[aá]til|opresiv|punzante/i) },
    { attr: 'Irradiación', present: (pi.clinicalNarrative ?? '').match(/irradi|sien|temporal/i) },
    { attr: 'Atenuantes', present: (pi.relievingFactors?.length ?? 0) > 0 },
    { attr: 'Desencadenantes', present: (pi.aggravatingFactors?.length ?? 0) > 0 },
    { attr: 'Otros síntomas', present: (pi.associatedSymptoms?.length ?? 0) > 0 },
  ]
  let aliciadoScore = 0
  for (const a of aliciado) {
    console.log(`  ${a.present ? '✅' : '❌'} ${a.attr}`)
    if (a.present) aliciadoScore++
  }
  console.log(`\n  Score ALICIADO: ${aliciadoScore}/8`)

  if (pi.missingData?.length > 0) {
    console.log('\n  Datos faltantes declarados:')
    for (const d of pi.missingData) console.log(`    - ${d}`)
  }

  // ─── CRUCES ENTRE SECCIONES (lo nuevo) ─────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  CRUCES CLÍNICOS ENTRE SECCIONES (nuevo en v4)')
  console.log('═'.repeat(70))
  const xrefs = r.clinicalCrossReferences ?? []
  if (xrefs.length === 0) {
    console.log('  ❌ Ningún cruce generado — el prompt no funcionó')
  } else {
    for (const x of xrefs) {
      console.log(`\n  [${x.relevance?.toUpperCase()}] ${x.observation}`)
      console.log(`  Secciones: ${x.sourceSections?.join(' × ')}`)
    }
  }

  // Evaluación de cruces esperados
  console.log('\n── Evaluación de cruces esperados ─────────────────────────────────')
  const xrefText = JSON.stringify(xrefs).toLowerCase()
  const expectedCrosses = [
    { label: 'AINEs + cefalea (abuso analgésicos)', found: xrefText.includes('aine') || xrefText.includes('ibuprofeno') || xrefText.includes('analg') },
    { label: 'HTA + cefalea (cefalea hipertensiva)', found: xrefText.includes('hta') || xrefText.includes('hipertens') || xrefText.includes('presion') || xrefText.includes('presión') },
    { label: 'Adherencia irregular + HTA', found: xrefText.includes('adherencia') || xrefText.includes('irregular') || xrefText.includes('olvida') },
    { label: 'Café + cefalea', found: xrefText.includes('caf') || xrefText.includes('cafeína') || xrefText.includes('cafeina') },
    { label: 'Antecedente familiar cardiovascular + HTA paciente', found: xrefText.includes('padre') || xrefText.includes('familiar') || xrefText.includes('cardiovascular') },
    { label: 'AINEs + acidez (gastropatía)', found: xrefText.includes('acidez') || xrefText.includes('gastro') || xrefText.includes('digestiv') },
    { label: 'Sedentarismo + HTA', found: xrefText.includes('sedentari') || xrefText.includes('actividad') },
  ]
  let crossScore = 0
  for (const c of expectedCrosses) {
    console.log(`  ${c.found ? '✅' : '❌'} ${c.label}`)
    if (c.found) crossScore++
  }
  console.log(`\n  Cruces detectados: ${crossScore}/${expectedCrosses.length}`)

  // ─── PREGUNTAS PARA EL MÉDICO (pase de guardia) ───────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  PREGUNTAS PARA EL MÉDICO DE PLANTA (pase R3)')
  console.log('═'.repeat(70))
  if (r.clinicianQuestions?.length > 0) {
    for (const q of r.clinicianQuestions) console.log(`  ? ${q}`)
  } else {
    console.log('  (ninguna)')
  }

  // ─── PREGUNTAS PARA EL PACIENTE ───────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  PREGUNTAS RESTANTES PARA EL PACIENTE')
  console.log('═'.repeat(70))
  if (r.nextQuestions?.length > 0) {
    for (const q of r.nextQuestions) {
      console.log(`\n  [${q.priority?.toUpperCase()}] ${q.question}`)
      console.log(`  Razón: ${q.rationale}`)
    }
  } else {
    console.log('  (ninguna — anamnesis completa)')
  }

  // ─── SAFETY FLAGS ──────────────────────────────────────────────────
  if (r.safetyFlags?.length > 0) {
    console.log('\n' + '═'.repeat(70))
    console.log('  SAFETY FLAGS')
    console.log('═'.repeat(70))
    for (const f of r.safetyFlags) console.log(`  🛡️  ${f}`)
  }

  // ─── VEREDICTO FINAL ──────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  VEREDICTO v3 → v4')
  console.log('═'.repeat(70))
  console.log(`\n  ALICIADO:  ${aliciadoScore}/8 atributos cubiertos`)
  console.log(`  Cruces:    ${crossScore}/7 relaciones detectadas (${xrefs.length} total)`)
  console.log(`  Preguntas médico: ${r.clinicianQuestions?.length ?? 0} (v3 no diferenciaba paciente/médico)`)
  console.log(`  Safety:    ${r.safetyFlags?.length ?? 0} flags`)
  console.log()

  if (aliciadoScore >= 6 && crossScore >= 4) {
    console.log('  NIVEL: R3 confirmado. Cruce integrador + semiología completa.')
  } else if (aliciadoScore >= 5 && crossScore >= 3) {
    console.log('  NIVEL: R2 avanzado. Mejora sobre v3 pero falta profundidad en cruces.')
  } else {
    console.log('  NIVEL: Sin mejora significativa. Revisar prompt.')
  }
  console.log()
}

main().catch((err) => { console.error('Error fatal:', err); process.exit(1) })
