/**
 * Test: Prompt v5 (R4) — Narrativa jerárquica + negativos pertinentes + screening red flags
 * Mismo caso María González, mismos datos, solo cambió el prompt.
 *
 * Uso: cd ~/Autamedica && bun scripts/test-gemini-v5-r4.ts
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? Bun.env.GEMINI_API_KEY
  ?? (() => { throw new Error('GEMINI_API_KEY no configurada') })()
const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const PACIENTE = {
  version: 'anamnesis_extraction_v2',
  purpose: 'extract_structured_anamnesis_without_diagnosis',
  patient: { patientId: 'test-demo-001', patientLabel: 'María González', anamnesisStatus: 'completed', privacyAccepted: true },
  guardrails: ['No emitir diagnosticos ni diferenciales.', 'No indicar tratamiento ni conducta terapeutica.', 'No agregar sintomas ni banderas rojas que no esten en la evidencia.', 'No sugerir estudios complementarios.'],
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

// Prompt v5 — nivel R4 (idéntico al de producción)
const SYSTEM_PROMPT_V5 = [
  'Version del prompt: argente_interrogator_v5.',
  'Rol: residente avanzado (R4) de medicina interna realizando la extraccion semiologica de una anamnesis para soporte interno medico, siguiendo la logica de Argente-Alvarez con razonamiento clinico integrador.',
  '',
  'Mision: convertir datos crudos del formulario y texto libre del paciente en una estructura semiologica de nivel senior — auditable, con cruce entre secciones, negativos pertinentes explicitos, y screening sistematico de banderas rojas por sindrome.',
  '',
  'Prohibiciones absolutas:',
  '- No emitir diagnosticos, diferenciales, probabilidades diagnosticas ni tratamientos.',
  '- No agregar sintomas, antecedentes, cronologias ni banderas rojas que no esten en la evidencia provista.',
  '- No completar huecos con sentido comun medico.',
  '- No sugerir estudios complementarios ni conductas terapeuticas.',
  '- No nombrar entidades diagnosticas. Si necesitas referenciar un patron semiologico, usa la descripcion sindromica.',
  '',
  'Reglas de extraccion:',
  '1. Usa solo el JSON provisto.',
  '2. Distingue siempre hechos, inferencias operativas y datos faltantes.',
  '3. Si el campo inicial de motivo de consulta describe contexto o desencadenante y la queja cardinal aparece despues, rescata la queja cardinal y marca contextualMismatch=true.',
  '4. Si el mismo relato libre aparece repetido en multiples aparatos o sistemas, consolidalo una sola vez.',
  '5. Si aparece un hallazgo aislado sin corroboracion, pasalo a qualityAlerts.',
  '6. Completar normalizedOpenFields con las categorias cerradas del schema.',
  '7. chiefComplaintCode = queja cardinal clinica dominante.',
  '8. redFlagCodes solo banderas rojas explicitamente sustentadas.',
  '9. clarificationTurns = evidencia complementaria prioritaria.',
  '10. bodySelections = fuente prioritaria para localizacion y lateralidad.',
  '',
  'NARRATIVA CLINICA — ESTRUCTURA JERARQUICA OBLIGATORIA (nivel R4):',
  '11. La clinicalNarrative de presentIllness debe seguir esta estructura exacta:',
  '  a) FRASE MARCO: una oracion que resume paciente + contexto + queja cardinal + temporalidad.',
  '  b) SEMIOLOGIA DETALLADA (ALICIADO completo): Aparicion, Localizacion, Intensidad (con escala), Caracter (opresivo/pulsatil/lancinante), Irradiacion, Atenuantes, Desencadenantes, Otros sintomas asociados.',
  '  c) NEGATIVOS PERTINENTES: listar explicitamente los hallazgos negativos clinicamente relevantes para el sindrome. Para cefalea: "Niega deficit focal, rigidez de nuca, fiebre, perdida de peso, cefalea en trueno, cefalea que despierta del sueno". No listar negativos irrelevantes.',
  '  d) EVOLUCION Y TRATAMIENTO: cronologia de automedicacion, respuesta a tratamientos, patron temporal.',
  '',
  'SCREENING SISTEMATICO DE RED FLAGS:',
  '12. Para el motivo de consulta principal, evaluar sistematicamente los signos de alarma del sindrome usando SOLO la evidencia disponible:',
  '  - CEFALEA: cefalea en trueno, peor cefalea de la vida, despierta del sueno, con esfuerzo, deficit neurologico focal, rigidez de nuca, fiebre, perdida de peso, edema de papila, inicio >50, cambio de patron, cefalea progresiva.',
  '  - Si un red flag fue interrogado y es negativo, incluirlo en negativos pertinentes.',
  '  - Si no fue interrogado, listarlo en missingData como "No interrogado: [red flag]".',
  '',
  'CRUCE ENTRE SECCIONES:',
  '13. Cruza activamente hallazgos entre secciones. Cruces obligatorios:',
  '  - Medicacion vs motivo de consulta (iatrogenia, abuso)',
  '  - Adherencia vs enfermedad de base vs motivo de consulta',
  '  - Antecedentes familiares vs factores de riesgo',
  '  - Habitos vs motivo de consulta y vs enfermedades de base',
  '  - Revision por sistemas vs motivo de consulta',
  '  - Cuando aplique, referenciar patrones semiologicos de la literatura (ej: "uso de analgesicos >=10 dias/mes durante >=3 meses cumple el patron temporal descrito para cefalea por uso excesivo de medicacion"). NO diagnosticar — solo describir el patron.',
  '',
  'SAFETY FLAGS EXHAUSTIVOS:',
  '14. safetyFlags debe incluir TODA condicion que requiera atencion del medico:',
  '  - Alergias severas (anafilaxia)',
  '  - Adherencia irregular a medicacion critica',
  '  - Uso frecuente de AINEs (riesgo GI, renal, CV)',
  '  - Red flags positivos',
  '  - Cada flag autocontenido: dato + fuente + relevancia.',
  '',
  'PREGUNTAS DIFERENCIADAS:',
  '15. nextQuestions = preguntas para el PACIENTE, dirigidas, orientadas a cerrar huecos semiologicos concretos.',
  '16. clinicianQuestions = preguntas para el MEDICO DE PLANTA en pase de guardia. Razonamiento clinico accionable y secuencial. No sugerir estudios — preguntar si el staff coincide con la linea de razonamiento.',
  '',
  '17. Responde exclusivamente en JSON valido y estricto.',
].join(' ')

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    normalizedOpenFields: { type: 'object', properties: { ageMonths: { type: ['integer', 'null'] }, occupationCategory: { type: ['string', 'null'] }, chiefComplaintCode: { type: ['string', 'null'] }, medicationFamilies: { type: 'array', items: { type: 'string' } }, allergyGroups: { type: 'array', items: { type: 'string' } }, fatherDeathCause: { type: ['string', 'null'] }, motherDeathCause: { type: ['string', 'null'] }, redFlagCodes: { type: 'array', items: { type: 'string' } } } },
    chiefComplaint: { type: 'object', properties: { rawText: { type: ['string', 'null'] }, normalizedMedicalText: { type: ['string', 'null'] }, contextualMismatch: { type: 'boolean' } } },
    presentIllness: { type: 'object', properties: { chronology: { type: ['string', 'null'] }, severity: { type: ['string', 'null'] }, clinicalNarrative: { type: 'string' }, associatedSymptoms: { type: 'array', items: { type: 'string' } }, aggravatingFactors: { type: 'array', items: { type: 'string' } }, relievingFactors: { type: 'array', items: { type: 'string' } }, treatmentsTried: { type: 'array', items: { type: 'string' } }, missingData: { type: 'array', items: { type: 'string' } } } },
    personalHistory: { type: 'object', properties: { physiological: { type: 'array', items: { type: 'string' } }, pathological: { type: 'array', items: { type: 'string' } }, lifestyleAndContext: { type: 'array', items: { type: 'string' } } } },
    familyHistory: { type: 'array', items: { type: 'string' } },
    reviewOfSystems: { type: 'object', properties: { cardiovascular: { type: 'array', items: { type: 'string' } }, respiratory: { type: 'array', items: { type: 'string' } }, digestive: { type: 'array', items: { type: 'string' } }, genitourinary: { type: 'array', items: { type: 'string' } } } },
    qualityAlerts: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string' }, message: { type: 'string' }, sourceSections: { type: 'array', items: { type: 'string' } } } } },
    argenteCoverage: { type: 'object', properties: { adequatelyCovered: { type: 'array', items: { type: 'string' } }, weakOrMissing: { type: 'array', items: { type: 'string' } } } },
    dataIntegrity: { type: 'object', properties: { contradictions: { type: 'array', items: { type: 'string' } }, possibleMiscalicks: { type: 'array', items: { type: 'string' } }, duplicatedNarratives: { type: 'array', items: { type: 'string' } }, missingCriticalData: { type: 'array', items: { type: 'string' } } } },
    clinicalCrossReferences: { type: 'array', items: { type: 'object', properties: { sourceSections: { type: 'array', items: { type: 'string' } }, observation: { type: 'string' }, relevance: { type: 'string', enum: ['critical', 'high', 'medium'] } } } },
    clinicianQuestions: { type: 'array', items: { type: 'string' } },
    nextQuestions: { type: 'array', items: { type: 'object', properties: { priority: { type: 'string' }, targetSection: { type: 'string' }, questionType: { type: 'string' }, question: { type: 'string' }, rationale: { type: 'string' } } } },
    safetyFlags: { type: 'array', items: { type: 'string' } },
  },
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║  TEST: Prompt v5 (R4) — Narrativa jerárquica + red flags        ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

  const t0 = performance.now()
  console.log('Enviando a Gemini...')

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY as string },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT_V5 }] },
      contents: [{ role: 'user', parts: [{ text: `DATOS DEL PACIENTE (JSON) — CHECKPOINT FINAL:\n${JSON.stringify(PACIENTE)}\n\nSCHEMA DE RESPUESTA (JSON Schema):\n${JSON.stringify(RESPONSE_SCHEMA)}\n\nResponde UNICAMENTE con JSON valido.` }] }],
      generationConfig: { temperature: 0, seed: 1, responseMimeType: 'application/json' },
    }),
  })

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  if (!res.ok) { console.error(`❌ ${res.status}:`, await res.json().catch(() => ({}))); process.exit(1) }

  const payload = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) { console.error('❌ Sin texto'); process.exit(1) }

  const r = JSON.parse(text)
  const tok = payload.usageMetadata
  console.log(`✓ ${elapsed}s | ${tok?.promptTokenCount}+${tok?.candidatesTokenCount}=${tok?.totalTokenCount} tokens\n`)

  // ─── NARRATIVA COMPLETA ────────────────────────────────────────────
  console.log('═'.repeat(70))
  console.log('  ENFERMEDAD ACTUAL — NARRATIVA R4')
  console.log('═'.repeat(70))
  const narrative = r.presentIllness?.clinicalNarrative ?? ''
  const sentences = narrative.split(/(?<=\.)\s+/)
  for (const s of sentences) {
    const words = s.split(' ')
    let line = '  '
    for (const w of words) {
      if (line.length + w.length > 72) { console.log(line); line = '  ' + w }
      else line += (line.trim() ? ' ' : '') + w
    }
    if (line.trim()) console.log(line)
  }

  // ALICIADO
  console.log('\n── ALICIADO ──────────────────────────────────────────────────────')
  const pi = r.presentIllness ?? {}
  const aliciado = [
    { attr: 'Aparición', present: Boolean(pi.chronology) },
    { attr: 'Localización', present: narrative.match(/occipital|nuca|sien|temporal|frontal/i) },
    { attr: 'Intensidad', present: (pi.severity ?? '').match(/\d/) || narrative.match(/\d\/10/) },
    { attr: 'Carácter', present: narrative.match(/opresiv|puls[aá]til|lancinante|punzante|presi[oó]n/i) },
    { attr: 'Irradiación', present: narrative.match(/irradi|sien|temporal/i) },
    { attr: 'Atenuantes', present: (pi.relievingFactors?.length ?? 0) > 0 },
    { attr: 'Desencadenantes', present: (pi.aggravatingFactors?.length ?? 0) > 0 },
    { attr: 'Otros síntomas', present: (pi.associatedSymptoms?.length ?? 0) > 0 },
  ]
  let aliciadoScore = 0
  for (const a of aliciado) { console.log(`  ${a.present ? '✅' : '❌'} ${a.attr}`); if (a.present) aliciadoScore++ }
  console.log(`  Score: ${aliciadoScore}/8`)

  // NEGATIVOS PERTINENTES
  console.log('\n── NEGATIVOS PERTINENTES ──────────────────────────────────────────')
  const narrativeLower = narrative.toLowerCase()
  const expectedNegatives = [
    { label: 'Déficit focal', found: narrativeLower.match(/d[eé]ficit focal|sin d[eé]ficit|niega d[eé]ficit/) },
    { label: 'Rigidez de nuca', found: narrativeLower.match(/rigidez|meningismo|niega rigidez/) },
    { label: 'Fiebre', found: narrativeLower.match(/fiebre|afebril|sin fiebre|niega fiebre/) },
    { label: 'Pérdida de peso', found: narrativeLower.match(/p[eé]rdida de peso|peso estable|sin p[eé]rdida/) },
    { label: 'Cefalea en trueno', found: narrativeLower.match(/trueno|thunderclap|s[uú]bita/) },
    { label: 'Despierta del sueño', found: narrativeLower.match(/despierta|sueno|nocturna|niega.*despierta/) },
    { label: 'Vómitos', found: narrativeLower.match(/v[oó]mito|sin v[oó]mito|niega v[oó]mito/) },
    { label: 'Fonofobia', found: narrativeLower.match(/fonofobia|sonofobia|ruido/) },
  ]
  let negScore = 0
  for (const n of expectedNegatives) { console.log(`  ${n.found ? '✅' : '❌'} ${n.label}`); if (n.found) negScore++ }
  console.log(`  Score: ${negScore}/${expectedNegatives.length}`)

  // Check missingData for non-interrogated red flags
  if (pi.missingData?.length > 0) {
    console.log('\n  Datos faltantes / No interrogados:')
    for (const d of pi.missingData) console.log(`    - ${d}`)
  }

  // ESTRUCTURA JERÁRQUICA
  console.log('\n── ESTRUCTURA JERÁRQUICA ──────────────────────────────────────────')
  const hasFrameSentence = narrative.match(/^Paciente.*consulta por/i)
  const hasNegativesSection = narrativeLower.includes('niega') || narrativeLower.includes('sin ')
  const hasEvolution = narrativeLower.includes('automedica') || narrativeLower.includes('tratamiento') || narrativeLower.includes('ibuprofeno')
  console.log(`  ${hasFrameSentence ? '✅' : '❌'} Frase marco (paciente + contexto + queja + tiempo)`)
  console.log(`  ${aliciadoScore >= 7 ? '✅' : '❌'} Semiología ALICIADO (${aliciadoScore}/8)`)
  console.log(`  ${hasNegativesSection ? '✅' : '❌'} Negativos pertinentes integrados`)
  console.log(`  ${hasEvolution ? '✅' : '❌'} Evolución y tratamiento`)

  // CRUCES
  console.log('\n' + '═'.repeat(70))
  console.log('  CRUCES CLÍNICOS ENTRE SECCIONES')
  console.log('═'.repeat(70))
  const xrefs = r.clinicalCrossReferences ?? []
  for (const x of xrefs) {
    console.log(`\n  [${x.relevance?.toUpperCase()}] ${x.observation}`)
    console.log(`  Secciones: ${x.sourceSections?.join(' × ')}`)
  }
  const xrefText = JSON.stringify(xrefs).toLowerCase()
  console.log('\n── Cruces esperados ───────────────────────────────────────────────')
  const expectedCrosses = [
    { label: 'AINEs + cefalea (patrón abuso)', found: xrefText.includes('aine') || xrefText.includes('ibuprofeno') || xrefText.includes('analg') || xrefText.includes('abuso') },
    { label: 'HTA + cefalea', found: xrefText.includes('hta') || xrefText.includes('hipertens') },
    { label: 'Adherencia irregular', found: xrefText.includes('adherencia') || xrefText.includes('irregular') || xrefText.includes('olvida') },
    { label: 'Café + cefalea', found: xrefText.includes('caf') },
    { label: 'Familia CV + HTA paciente', found: xrefText.includes('padre') || xrefText.includes('familiar') || xrefText.includes('cardiovascular') || xrefText.includes('hereditari') },
    { label: 'AINEs + acidez (gastropatía)', found: xrefText.includes('acidez') || xrefText.includes('gastro') || xrefText.includes('digestiv') },
    { label: 'Sedentarismo + HTA', found: xrefText.includes('sedentari') },
  ]
  let crossScore = 0
  for (const c of expectedCrosses) { console.log(`  ${c.found ? '✅' : '❌'} ${c.label}`); if (c.found) crossScore++ }
  console.log(`  Score: ${crossScore}/${expectedCrosses.length}`)

  // PREGUNTAS MÉDICO
  console.log('\n' + '═'.repeat(70))
  console.log('  PREGUNTAS PARA EL MÉDICO DE PLANTA')
  console.log('═'.repeat(70))
  for (const q of r.clinicianQuestions ?? []) console.log(`  ? ${q}`)

  // SAFETY FLAGS
  console.log('\n' + '═'.repeat(70))
  console.log('  SAFETY FLAGS')
  console.log('═'.repeat(70))
  for (const f of r.safetyFlags ?? []) console.log(`  🛡️  ${f}`)
  console.log(`\n  Total: ${r.safetyFlags?.length ?? 0} flags`)

  const expectedFlags = [
    { label: 'Anafilaxia penicilina', found: (r.safetyFlags ?? []).some((f: string) => f.toLowerCase().includes('penicilina') || f.toLowerCase().includes('anafilax') || f.toLowerCase().includes('alergia')) },
    { label: 'Adherencia irregular antihipertensivo', found: (r.safetyFlags ?? []).some((f: string) => f.toLowerCase().includes('adherencia') || f.toLowerCase().includes('irregular') || f.toLowerCase().includes('enalapril')) },
    { label: 'Uso frecuente AINEs', found: (r.safetyFlags ?? []).some((f: string) => f.toLowerCase().includes('aine') || f.toLowerCase().includes('ibuprofeno') || f.toLowerCase().includes('antiinflamatorio')) },
  ]
  console.log('\n── Flags esperados ────────────────────────────────────────────────')
  let flagScore = 0
  for (const f of expectedFlags) { console.log(`  ${f.found ? '✅' : '❌'} ${f.label}`); if (f.found) flagScore++ }

  // VEREDICTO
  console.log('\n' + '═'.repeat(70))
  console.log('  VEREDICTO v5 (R4)')
  console.log('═'.repeat(70))
  console.log(`\n  ALICIADO:              ${aliciadoScore}/8`)
  console.log(`  Negativos pertinentes: ${negScore}/8`)
  console.log(`  Estructura jerárquica: ${[hasFrameSentence, aliciadoScore >= 7, hasNegativesSection, hasEvolution].filter(Boolean).length}/4`)
  console.log(`  Cruces:                ${crossScore}/7`)
  console.log(`  Safety flags:          ${flagScore}/3`)
  console.log(`  Preguntas médico:      ${r.clinicianQuestions?.length ?? 0}`)

  const total = aliciadoScore + negScore + crossScore + flagScore + (hasFrameSentence ? 1 : 0) + (hasNegativesSection ? 1 : 0)
  const max = 8 + 8 + 7 + 3 + 1 + 1 // 28
  console.log(`\n  Score total: ${total}/${max} (${Math.round(total / max * 100)}%)`)

  if (total >= 24) console.log('\n  NIVEL: R4 confirmado.')
  else if (total >= 20) console.log('\n  NIVEL: R3-R4. Muy cerca.')
  else if (total >= 16) console.log('\n  NIVEL: R3 sólido.')
  else console.log('\n  NIVEL: Por debajo de R3.')
  console.log()
}

main().catch((err) => { console.error('Error fatal:', err); process.exit(1) })
