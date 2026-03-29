/**
 * Test v5 (R4): Caso pediátrico — mamá sin estudios básicos
 * Evalúa si el sistema maneja lenguaje coloquial, datos imprecisos,
 * y logra extraer semiología útil de un relato desestructurado.
 *
 * Uso: cd ~/Autamedica && bun scripts/test-gemini-v5-pediatrico.ts
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? Bun.env.GEMINI_API_KEY
  ?? (() => { throw new Error('GEMINI_API_KEY no configurada') })()
const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Mamá de 22 años, sin estudios completos, lleva a su hijo de 3 años
// Lenguaje coloquial, impreciso, con errores típicos
const PACIENTE = {
  version: 'anamnesis_extraction_v2',
  purpose: 'extract_structured_anamnesis_without_diagnosis',
  patient: {
    patientId: 'test-pedia-001',
    patientLabel: 'Thiago Romero (3 años) — Informante: Yesica Romero (madre)',
    anamnesisStatus: 'completed',
    privacyAccepted: true,
  },
  guardrails: [
    'No emitir diagnosticos ni diferenciales.',
    'No indicar tratamiento ni conducta terapeutica.',
    'No agregar sintomas ni banderas rojas que no esten en la evidencia.',
    'No sugerir estudios complementarios.',
  ],
  deterministicSummary: 'Paciente masculino, 3 años. Fiebre y tos 4 días. Vómito 1 vez. Inapetencia. No vacunas al día. Madre refiere que "no quiere comer nada". Medicado con ibuprofeno por la madre.',
  sourceSections: [
    {
      section: 'filiacion',
      data: {
        fecha_nacimiento: '2023-05-20',
        ocupacion_actual: 'No aplica (menor)',
        informante: 'Yesica Romero, madre, 22 años',
        relacion_informante: 'madre',
        observaciones_informante: 'La mamá no terminó la secundaria. Vive con la abuela del nene. Tiene otro hijo de 1 año.',
      },
      completed: true,
    },
    {
      section: 'motivo_consulta',
      data: {
        motivo_principal: 'fiebre y tos',
        descripcion_detallada: 'hace como 4 dias que tiene fiebre el nene, le sube a la noche sobre todo y le di ibuprofeno pero le baja un rato nomas despues le vuelve a subir. tambien tiene una tos fea como que le sale de adentro y a veces como que le cuesta respirar un poco sobre todo cuando tose mucho. ayer vomito una vez pero creo que fue por la tos. no quiere comer nada solo toma la leche y agua.',
        desde_cuando: '4 dias',
        intentos_previos: 'le vengo dando ibuprofeno de nene cada 6 horas masomenos, a veces cada 8. no se si le estoy dando bien la dosis, le doy como 3 mililitros creo. una vecina me dijo que le de miel con limon pero no le gusto.',
      },
      completed: true,
    },
    {
      section: 'antecedentes_personales',
      data: {
        enfermedades_previas: 'cuando tenia como 6 meses lo internaron por bronquiolitis como 3 dias estuvo. despues no tuvo mas nada grabe. le da otitis seguido, como 3 veces ya tuvo este año.',
        cirugias: 'no',
        internaciones: 'la de la bronquiolitis nomas',
        vacunas: 'no esta al dia creo, le faltan algunas, no me acuerdo cuales. la ultima que le puse fue hace bastante.',
        nacimiento: 'nacio de 37 semanas por parto normal, peso 2800 gramos. no tuvo problemas al nacer.',
      },
      completed: true,
    },
    {
      section: 'medicamentos',
      data: {
        toma_medicamentos: true,
        lista_medicamentos: 'ibuprofeno de nene, el que viene en gotero. no se como se llama la marca. le doy 3 ml cada 6-8 horas.',
        automedicacion: 'solo eso. la vecina me dijo que le de amoxicilina que le habia sobrado de su nena pero no le di porque me dio miedo.',
      },
      completed: true,
    },
    {
      section: 'alergias',
      data: {
        tiene_alergias: false,
        lista_alergias: 'no que yo sepa. nunca le paso nada con nada.',
      },
      completed: true,
    },
    {
      section: 'antecedentes_familiares',
      data: {
        padre: 'no se mucho del papa, no esta. creo que es asmatico.',
        madre: 'yo estoy bien, no tengo nada. bueno tengo anemia me dijeron.',
        hermanos: 'tiene un hermanito de 1 año, el esta bien por ahora.',
        enfermedades_familiares: 'mi mama tiene diabetes creo. mi abuela que es la que me ayuda con los nenes tiene presion alta.',
      },
      completed: true,
    },
    {
      section: 'habitos',
      data: {
        alimentacion: 'come de todo cuando esta bien pero ahora no quiere nada. toma mucha leche, como 3 o 4 mamaderas por dia todavia. no le gusta la verdura.',
        sueno: 'duerme con nosotras en la cama. estas noches se despierta mucho por la tos y la fiebre.',
        actividad_fisica: 'es re activo normalmente pero estos dias esta caido, no quiere jugar.',
        ambiente: 'vivimos en una casa humeda, hay un poco de humedad en la pieza donde dormimos. mi abuela fuma adentro a veces.',
      },
      completed: true,
    },
    {
      section: 'cardiovascular',
      data: {
        dolor_pecho: false,
        palpitaciones: false,
        observaciones: '',
      },
      completed: true,
    },
    {
      section: 'respiratorio',
      data: {
        tos: true,
        expectoracion: false,
        disnea: true,
        sibilancias: false,
        observaciones: 'tiene tos fea como profunda. a veces parece que le cuesta respirar cuando tose. no le escuche silbido pero no se si estoy escuchando bien.',
      },
      completed: true,
    },
    {
      section: 'digestivo',
      data: {
        nauseas: false,
        vomitos: true,
        acidez: false,
        dolor_abdominal: false,
        cambio_habito_intestinal: false,
        observaciones: 'vomito una vez ayer, creo que fue por la tos. hace caca normal. no quiere comer pero toma liquidos.',
      },
      completed: true,
    },
    {
      section: 'genitourinario',
      data: {
        disuria: false,
        hematuria: false,
        frecuencia_urinaria: 'normal creo, moja los pañales igual que siempre',
        observaciones: '',
      },
      completed: true,
    },
  ],
  bodySelections: [],
  clarificationTurns: [
    {
      question: '¿Le tomó la temperatura con termómetro? ¿Cuánto le marcó?',
      answer: 'si le puse el termometro ayer a la noche y le marco 38.7. antes de ayer creo que le marco 39 y pico pero no me acuerdo bien. cuando le doy el ibuprofeno le baja a 37 y algo.',
    },
    {
      question: '¿Notó que los labios o las uñas del nene se pongan azulados, o que respire muy rápido cuando está tranquilo?',
      answer: 'azul no, eso no. pero si respira como rapido a veces, sobre todo a la noche. cuando duerme se le mueven las costillitas para adentro, mi abuela dice que eso no esta bien.',
    },
    {
      question: '¿El nene tuvo contacto con alguien enfermo en los últimos días, en la guardería o en la familia?',
      answer: 'si, en la salita donde va habia como 3 o 4 nenes con tos y mocos la semana pasada. y mi otro nene el chiquito tambien tiene mocos pero no tiene fiebre el.',
    },
  ],
}

const SYSTEM_PROMPT_V5 = [
  'Version del prompt: argente_interrogator_v5.',
  'Rol: residente avanzado (R4) de medicina interna realizando la extraccion semiologica de una anamnesis para soporte interno medico, siguiendo la logica de Argente-Alvarez con razonamiento clinico integrador.',
  '',
  'Mision: convertir datos crudos del formulario y texto libre del paciente en una estructura semiologica de nivel senior — auditable, con cruce entre secciones, negativos pertinentes explicitos, y screening sistematico de banderas rojas por sindrome.',
  '',
  'CONTEXTO ESPECIAL — PACIENTE PEDIATRICO:',
  'El informante es un familiar (no el paciente). El relato puede ser impreciso, coloquial, con errores de terminologia. Tu trabajo es:',
  '  a) Extraer la informacion clinica util del lenguaje coloquial sin distorsionarla.',
  '  b) Preservar las palabras exactas del informante cuando son clinicamente relevantes (ej: "le cuesta respirar", "se le mueven las costillitas").',
  '  c) Traducir observaciones del cuidador a terminos semiologicos cuando sea posible (ej: "se le mueven las costillitas para adentro" = tiraje intercostal referido por familiar).',
  '  d) Marcar explicitamente cuando un dato es impreciso o el informante no esta seguro ("la madre refiere sin certeza que...").',
  '  e) Evaluar la confiabilidad del informante y documentar limitaciones.',
  '',
  'Prohibiciones absolutas:',
  '- No emitir diagnosticos, diferenciales, probabilidades diagnosticas ni tratamientos.',
  '- No agregar sintomas, antecedentes, cronologias ni banderas rojas que no esten en la evidencia provista.',
  '- No completar huecos con sentido comun medico.',
  '- No sugerir estudios complementarios ni conductas terapeuticas.',
  '- No nombrar entidades diagnosticas.',
  '',
  'Reglas de extraccion:',
  '1. Usa solo el JSON provisto.',
  '2. Distingue siempre hechos, inferencias operativas y datos faltantes.',
  '3. Completar normalizedOpenFields con las categorias cerradas del schema.',
  '4. redFlagCodes solo banderas rojas explicitamente sustentadas.',
  '5. clarificationTurns = evidencia complementaria prioritaria.',
  '',
  'NARRATIVA CLINICA — ESTRUCTURA JERARQUICA OBLIGATORIA:',
  '6. clinicalNarrative debe seguir: a) Frase marco, b) ALICIADO completo, c) Negativos pertinentes, d) Evolucion y tratamiento.',
  '',
  'SCREENING SISTEMATICO DE RED FLAGS:',
  '7. Para paciente pediatrico con fiebre + dificultad respiratoria, evaluar:',
  '  - Signos de dificultad respiratoria: tiraje, aleteo nasal, quejido, taquipnea, cianosis',
  '  - Signos de deshidratacion: diuresis, llanto con lagrimas, turgencia, fontanela (si aplica)',
  '  - Signos de sepsis: irritabilidad, letargia, rechazo alimentario, fiebre >39 sostenida',
  '  - Estado de vacunacion como factor de riesgo',
  '  - Si un red flag fue interrogado y es negativo, incluirlo en negativos pertinentes.',
  '  - Si no fue interrogado, listarlo en missingData.',
  '',
  'CRUCE ENTRE SECCIONES:',
  '8. Cruces obligatorios en pediatria:',
  '  - Antecedente respiratorio (bronquiolitis) + cuadro actual',
  '  - Vacunacion incompleta + infeccion actual',
  '  - Exposicion ambiental (humedad, tabaquismo pasivo) + patologia respiratoria recurrente',
  '  - Otitis recurrente + cuadro respiratorio actual',
  '  - Contacto epidemiologico + cuadro infeccioso',
  '  - Dosificacion de medicacion por cuidador no profesional',
  '',
  'SAFETY FLAGS EXHAUSTIVOS:',
  '9. Incluir TODA condicion que requiera atencion del medico.',
  '',
  'PREGUNTAS DIFERENCIADAS:',
  '10. nextQuestions = para el CUIDADOR. Lenguaje simple, sin tecnicismos.',
  '11. clinicianQuestions = para el MEDICO DE PLANTA en pase de guardia.',
  '',
  '12. Responde exclusivamente en JSON valido y estricto.',
].join(' ')

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    normalizedOpenFields: { type: 'object', properties: { ageMonths: { type: ['integer', 'null'] }, chiefComplaintCode: { type: ['string', 'null'] }, medicationFamilies: { type: 'array', items: { type: 'string' } }, allergyGroups: { type: 'array', items: { type: 'string' } }, redFlagCodes: { type: 'array', items: { type: 'string' } } } },
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
  console.log('║  TEST PEDIÁTRICO: Thiago 3 años — Mamá sin estudios básicos     ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

  const t0 = performance.now()
  console.log('Enviando a Gemini...')

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY as string },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT_V5 }] },
      contents: [{ role: 'user', parts: [{ text: `DATOS DEL PACIENTE PEDIÁTRICO (JSON) — CHECKPOINT FINAL:\n${JSON.stringify(PACIENTE)}\n\nSCHEMA:\n${JSON.stringify(RESPONSE_SCHEMA)}\n\nResponde UNICAMENTE con JSON valido.` }] }],
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

  // ─── NARRATIVA ─────────────────────────────────────────────────────
  console.log('═'.repeat(70))
  console.log('  ENFERMEDAD ACTUAL — CASO PEDIÁTRICO')
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

  // Datos estructurados
  const pi = r.presentIllness ?? {}
  if (pi.chronology) console.log(`\n  Cronología: ${pi.chronology}`)
  if (pi.severity) console.log(`  Severidad: ${pi.severity}`)
  if (pi.associatedSymptoms?.length > 0) console.log(`  Síntomas asociados: ${pi.associatedSymptoms.join(', ')}`)
  if (pi.aggravatingFactors?.length > 0) console.log(`  Agravantes: ${pi.aggravatingFactors.join(', ')}`)
  if (pi.relievingFactors?.length > 0) console.log(`  Aliviantes: ${pi.relievingFactors.join(', ')}`)
  if (pi.treatmentsTried?.length > 0) console.log(`  Tratamientos: ${pi.treatmentsTried.join(', ')}`)

  if (pi.missingData?.length > 0) {
    console.log('\n  Datos faltantes / No interrogados:')
    for (const d of pi.missingData) console.log(`    - ${d}`)
  }

  // ─── CRUCES ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  CRUCES CLÍNICOS')
  console.log('═'.repeat(70))
  const xrefs = r.clinicalCrossReferences ?? []
  for (const x of xrefs) {
    console.log(`\n  [${x.relevance?.toUpperCase()}] ${x.observation}`)
    console.log(`  Secciones: ${x.sourceSections?.join(' × ')}`)
  }

  // Evaluación de cruces esperados en pediátrico
  const xrefText = JSON.stringify(xrefs).toLowerCase()
  console.log('\n── Cruces esperados (pediátrico) ──────────────────────────────────')
  const expectedCrosses = [
    { label: 'Bronquiolitis previa + cuadro respiratorio actual', found: xrefText.includes('bronquiolitis') || xrefText.includes('antecedente respiratorio') },
    { label: 'Vacunación incompleta + infección', found: xrefText.includes('vacun') },
    { label: 'Tabaquismo pasivo + patología respiratoria', found: xrefText.includes('tabaco') || xrefText.includes('fuma') || xrefText.includes('humo') || xrefText.includes('tabaquismo') },
    { label: 'Humedad ambiental + respiratorio', found: xrefText.includes('humedad') || xrefText.includes('ambiente') },
    { label: 'Otitis recurrente + cuadro actual', found: xrefText.includes('otitis') },
    { label: 'Contacto epidemiológico + infección', found: xrefText.includes('contacto') || xrefText.includes('guarder') || xrefText.includes('salita') || xrefText.includes('epidemiol') },
    { label: 'Dosificación imprecisa ibuprofeno', found: xrefText.includes('dosis') || xrefText.includes('dosific') || xrefText.includes('3 ml') || xrefText.includes('peso') },
  ]
  let crossScore = 0
  for (const c of expectedCrosses) { console.log(`  ${c.found ? '✅' : '❌'} ${c.label}`); if (c.found) crossScore++ }
  console.log(`  Score: ${crossScore}/${expectedCrosses.length}`)

  // ─── SAFETY FLAGS ──────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  SAFETY FLAGS')
  console.log('═'.repeat(70))
  for (const f of r.safetyFlags ?? []) console.log(`  🛡️  ${f}`)

  const flagText = (r.safetyFlags ?? []).join(' ').toLowerCase()
  console.log('\n── Flags esperados ────────────────────────────────────────────────')
  const expectedFlags = [
    { label: 'Tiraje intercostal (dificultad respiratoria)', found: flagText.includes('tiraje') || flagText.includes('costilla') || flagText.includes('dificultad respiratoria') || flagText.includes('distress') },
    { label: 'Fiebre >39°C', found: flagText.includes('39') || flagText.includes('fiebre') },
    { label: 'Vacunación incompleta', found: flagText.includes('vacun') },
    { label: 'Tabaquismo pasivo', found: flagText.includes('tabaco') || flagText.includes('fuma') || flagText.includes('humo') || flagText.includes('tabaquismo') },
    { label: 'Inapetencia / rechazo alimentario', found: flagText.includes('apetencia') || flagText.includes('alimenta') || flagText.includes('comer') || flagText.includes('inapet') || flagText.includes('rechazo') },
  ]
  let flagScore = 0
  for (const f of expectedFlags) { console.log(`  ${f.found ? '✅' : '❌'} ${f.label}`); if (f.found) flagScore++ }

  // ─── PREGUNTAS PARA LA MAMÁ ────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  PREGUNTAS PARA LA MAMÁ (lenguaje simple)')
  console.log('═'.repeat(70))
  for (const q of r.nextQuestions ?? []) {
    console.log(`\n  [${q.priority?.toUpperCase()}] ${q.question}`)
    console.log(`  Razón: ${q.rationale}`)
  }

  // ─── PREGUNTAS PARA EL MÉDICO ──────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  PREGUNTAS PARA EL MÉDICO DE GUARDIA')
  console.log('═'.repeat(70))
  for (const q of r.clinicianQuestions ?? []) console.log(`  ? ${q}`)

  // ─── EVALUACIÓN ESPECIAL: manejo del lenguaje coloquial ────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  EVALUACIÓN: MANEJO DEL LENGUAJE COLOQUIAL')
  console.log('═'.repeat(70))
  const narrativeLower = narrative.toLowerCase()
  const coloquialChecks = [
    { label: '"costillitas para adentro" → tiraje intercostal', found: narrativeLower.includes('tiraje') },
    { label: '"tos fea como de adentro" → tos productiva/profunda', found: narrativeLower.includes('productiva') || narrativeLower.includes('profunda') || narrativeLower.includes('húmeda') || narrativeLower.includes('humeda') },
    { label: '"le cuesta respirar" → dificultad respiratoria/disnea', found: narrativeLower.includes('dificultad respiratoria') || narrativeLower.includes('disnea') || narrativeLower.includes('distress') },
    { label: '"respira rápido" → taquipnea', found: narrativeLower.includes('taquipnea') || narrativeLower.includes('frecuencia respiratoria') },
    { label: '"no quiere comer" → inapetencia/hiporexia', found: narrativeLower.includes('inapetencia') || narrativeLower.includes('hiporexia') || narrativeLower.includes('rechazo alimentario') },
    { label: 'Preserva palabras de la madre cuando son relevantes', found: narrativeLower.includes('refiere') || narrativeLower.includes('la madre') || narrativeLower.includes('familiar') || narrativeLower.includes('informante') },
    { label: 'Marca imprecisión ("sin certeza", "aproximadamente")', found: narrativeLower.includes('sin certeza') || narrativeLower.includes('aproximadamente') || narrativeLower.includes('imprecis') || narrativeLower.includes('refiere sin') || narrativeLower.includes('no precisa') },
  ]
  let coloquialScore = 0
  for (const c of coloquialChecks) { console.log(`  ${c.found ? '✅' : '❌'} ${c.label}`); if (c.found) coloquialScore++ }
  console.log(`  Score: ${coloquialScore}/${coloquialChecks.length}`)

  // ─── VEREDICTO ─────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  VEREDICTO — CASO PEDIÁTRICO')
  console.log('═'.repeat(70))
  console.log(`\n  Cruces clínicos:       ${crossScore}/7`)
  console.log(`  Safety flags:          ${flagScore}/5`)
  console.log(`  Lenguaje coloquial:    ${coloquialScore}/7`)
  console.log(`  Preguntas mamá:        ${r.nextQuestions?.length ?? 0}`)
  console.log(`  Preguntas médico:      ${r.clinicianQuestions?.length ?? 0}`)

  const total = crossScore + flagScore + coloquialScore
  const max = 7 + 5 + 7
  console.log(`\n  Score total: ${total}/${max} (${Math.round(total / max * 100)}%)`)

  if (total >= 16) console.log('\n  El sistema maneja el caso pediátrico con informante no profesional correctamente.')
  else if (total >= 12) console.log('\n  Manejo parcial — algunos aspectos pediátricos perdidos.')
  else console.log('\n  El sistema no está preparado para pediátría con informantes de baja escolaridad.')
  console.log()
}

main().catch((err) => { console.error('Error fatal:', err); process.exit(1) })
