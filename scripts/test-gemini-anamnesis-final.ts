/**
 * Test FINAL: Paciente respondió las 3 preguntas de Gemini + completó los 13 pasos.
 * Simula el checkpoint final para ver qué genera el PDF.
 *
 * Uso: cd ~/Autamedica && bun scripts/test-gemini-anamnesis-final.ts
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  ?? Bun.env.GEMINI_API_KEY
  ?? (() => { throw new Error('GEMINI_API_KEY no configurada') })()

const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// ─── Paciente completo: 13 pasos + respuestas a clarificación ────────────

const PACIENTE_COMPLETO = {
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
    'Consolidar texto libre disperso en una sola queja cardinal si corresponde.',
    'Marcar datos incongruentes o aislados como alertas a confirmar.',
    'Mantener separados hechos, inferencias y datos faltantes.',
    'Usar bodySelections como evidencia anatomica estructurada cuando exista.',
  ],
  deterministicSummary: [
    'Paciente femenina, 42 años.',
    'Ocupación: contadora, 15 años en puesto actual, trabajo sedentario.',
    'Motivo de consulta: cefalea frecuente de 3 meses de evolución, predominio vespertino.',
    'Enfermedades previas: HTA diagnosticada hace 2 años. Cesárea 2015.',
    'Medicamentos: enalapril 10mg/día (adherencia irregular). Automedicación con ibuprofeno 400mg 2-3x/sem.',
    'Alergias: penicilina (anafilaxia en infancia).',
    'Antecedentes familiares: madre HTA, padre fallecido IAM a los 65.',
    'Hábitos: café 3 tazas/día, sedentaria, no tabaco, alcohol social.',
    'Cardiovascular: sin palpitaciones, sin disnea, sin edemas.',
    'Respiratorio: sin tos, sin disnea.',
    'Digestivo: acidez ocasional post-ibuprofeno.',
    'Genitourinario: ciclos regulares, sin disuria.',
  ].join(' '),
  sourceSections: [
    // PASO 1: Fecha de nacimiento
    {
      section: 'filiacion',
      data: {
        fecha_nacimiento: '1984-03-15',
        ocupacion_actual: 'Contadora en estudio contable',
        anos_en_puesto: 15,
        tipo_trabajo: 'sedentario',
        exposiciones_laborales: 'Pantalla de computadora 10+ horas/día, estrés fiscal en cierres de mes',
      },
      completed: true,
    },
    // PASO 2-3: Motivo de consulta
    {
      section: 'motivo_consulta',
      data: {
        motivo_principal: 'Dolor de cabeza frecuente',
        descripcion_detallada: 'Desde hace unos 3 meses tengo dolores de cabeza casi todos los días, sobre todo a la tarde después de estar mucho rato frente a la computadora. A veces siento como una presión en la nuca y se me va hacia las sienes. Los fines de semana mejora bastante.',
        desde_cuando: '3 meses',
        intentos_previos: 'Tomo ibuprofeno 400mg cuando no aguanto, me calma por unas horas pero vuelve. También probé con paracetamol pero no me hace tanto efecto.',
      },
      completed: true,
    },
    // PASO 4: Enfermedades previas
    {
      section: 'antecedentes_personales',
      data: {
        enfermedades_previas: 'Hipertensión arterial diagnosticada hace 2 años en un control de rutina. Me dijeron que tenía la presión alta y me dieron pastillas.',
        cirugias: 'Cesárea en 2015',
        internaciones: 'Solo la cesárea',
      },
      completed: true,
    },
    // PASO 5: Medicamentos
    {
      section: 'medicamentos',
      data: {
        toma_medicamentos: true,
        lista_medicamentos: 'Enalapril 10mg, una vez al día a la mañana. A veces se me olvida los fines de semana.',
        automedicacion: 'Ibuprofeno 400mg para el dolor de cabeza, 2-3 veces por semana. Paracetamol 500mg cuando no tengo ibuprofeno.',
      },
      completed: true,
    },
    // PASO 6: Alergias
    {
      section: 'alergias',
      data: {
        tiene_alergias: true,
        lista_alergias: 'Penicilina: la tomé de chica y me salieron ronchas en todo el cuerpo, se me hincharon los labios y me costaba respirar. Me llevaron a la guardia.',
      },
      completed: true,
    },
    // PASO 7: Antecedentes familiares
    {
      section: 'antecedentes_familiares',
      data: {
        padre: 'Fallecido a los 65 años de un infarto. Tenía presión alta y colesterol.',
        madre: 'Viva, 70 años, hipertensa, toma medicación. Operada de vesícula.',
        hermanos: 'Un hermano, 38 años, sano.',
        enfermedades_familiares: 'Padre y madre hipertensos. Abuela materna diabética tipo 2.',
      },
      completed: true,
    },
    // PASO 8: Hábitos
    {
      section: 'habitos',
      data: {
        tabaco: 'No fumo, nunca fumé.',
        alcohol: 'Social, una copa de vino los fines de semana, nada más.',
        cafe: 'Tomo como 3 tazas por día, a veces 4 cuando estoy con mucho trabajo.',
        actividad_fisica: 'Sedentaria. No hago ejercicio. Trabajo sentada todo el día.',
        sueno: 'Duermo 6-7 horas, me cuesta dormirme a veces por estrés del trabajo.',
        alimentacion: 'Como bastante bien, pero como rápido en el trabajo. Mucho delivery.',
      },
      completed: true,
    },
    // PASO 9: Cardiovascular
    {
      section: 'cardiovascular',
      data: {
        dolor_pecho: false,
        palpitaciones: false,
        disnea_esfuerzo: false,
        edemas: false,
        sincope: false,
        observaciones: '',
      },
      completed: true,
    },
    // PASO 10: Respiratorio
    {
      section: 'respiratorio',
      data: {
        tos: false,
        expectoracion: false,
        disnea: false,
        sibilancias: false,
        observaciones: '',
      },
      completed: true,
    },
    // PASO 11: Digestivo
    {
      section: 'digestivo',
      data: {
        nauseas: false,
        vomitos: false,
        acidez: true,
        dolor_abdominal: false,
        cambio_habito_intestinal: false,
        observaciones: 'A veces me agarra acidez cuando tomo mucho ibuprofeno.',
      },
      completed: true,
    },
    // PASO 12: Genitourinario
    {
      section: 'genitourinario',
      data: {
        disuria: false,
        hematuria: false,
        frecuencia_urinaria: 'normal',
        ciclo_menstrual: 'Regular, cada 28-30 días.',
        observaciones: '',
      },
      completed: true,
    },
  ],
  bodySelections: [],
  // Respuestas del paciente a las 3 preguntas de Gemini
  clarificationTurns: [
    {
      question: 'En una escala del 1 al 10, ¿qué intensidad suele alcanzar su dolor de cabeza?',
      answer: 'Generalmente un 6 o 7. Cuando es fuerte llega a 8 y no puedo concentrarme en nada, tengo que cerrar los ojos.',
    },
    {
      question: '¿Cuánto tiempo dura aproximadamente si no toma medicación?',
      answer: 'Si no tomo nada me puede durar toda la tarde, unas 4-5 horas. A veces me acuesto con el dolor y al otro día ya no lo tengo.',
    },
    {
      question: '¿El dolor se acompaña de náuseas, vómitos, molestia con la luz o con los ruidos?',
      answer: 'Sí, cuando el dolor es más fuerte me molesta la luz, sobre todo la de la pantalla. Náuseas a veces, pero nunca vomité. El ruido no me molesta particularmente.',
    },
  ],
}

const SYSTEM_PROMPT = [
  'Version del prompt: argente_interrogator_v3.',
  'Rol: extractor clinico de anamnesis para soporte interno medico.',
  'Mision: convertir datos crudos del formulario y texto libre del paciente en una estructura semiologica auditable, siguiendo la logica de Argente-Alvarez.',
  'Prohibiciones absolutas:',
  '- No emitir diagnosticos, diferenciales, probabilidades diagnosticas ni tratamientos.',
  '- No agregar sintomas, antecedentes, cronologias ni banderas rojas que no esten en la evidencia provista.',
  '- No completar huecos con sentido comun medico.',
  'Reglas de trabajo:',
  '1. Usa solo el JSON provisto.',
  '2. Distingue siempre hechos, inferencias operativas y datos faltantes.',
  '3. Si el campo inicial de motivo de consulta describe contexto o desencadenante y la queja cardinal aparece despues, rescata la queja cardinal y marca contextualMismatch=true.',
  '4. Si el mismo relato libre aparece repetido en multiples aparatos o sistemas, consolidalo una sola vez y marca duplicacion en dataIntegrity.duplicatedNarratives.',
  '5. Si aparece un hallazgo aislado sin corroboracion o con alta probabilidad de misclick, no lo trates como hecho firme: pasalo a qualityAlerts y dataIntegrity.possibleMiscalicks.',
  '6. La enfermedad actual debe quedar redactada como narrativa clinica neutra, cronologica y verificable, sin diagnostico.',
  '7. La salida debe cubrir, con honestidad, estas secciones Argente: datos personales, motivo de consulta, enfermedad actual, antecedentes personales, antecedentes familiares e interrogatorio por sistemas.',
  '8. Si una seccion no esta suficientemente sustentada por los datos, declarala en argenteCoverage.weakOrMissing y explicita sus faltantes.',
  '9. nextQuestions deben servir para que un flujo conversacional repregunte lo estrictamente necesario para cerrar huecos semiologicos.',
  '10. Si clarificationTurns esta presente, debes tratar sus respuestas como evidencia complementaria y prioritaria para cerrar huecos semiologicos, sin inventar nada fuera de lo respondido.',
  '11. Si una aclaracion resuelve una seccion debil, debes reducir weakOrMissing y actualizar nextQuestions en consecuencia.',
  '12. Responde exclusivamente en JSON valido y estricto.',
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
          code: { type: 'string' },
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

// ─── Ejecución ───────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  TEST FINAL: Anamnesis completa + clarificaciones Gemini   ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Modelo: ${GEMINI_MODEL}`)
  console.log(`Paciente: ${PACIENTE_COMPLETO.patient.patientLabel}`)
  console.log(`Secciones: ${PACIENTE_COMPLETO.sourceSections.length}/13`)
  console.log(`Clarificaciones: ${PACIENTE_COMPLETO.clarificationTurns.length} respuestas`)
  console.log()

  const startTime = performance.now()
  console.log('Enviando a Gemini (checkpoint final)...')

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY as string,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [{
          text: [
            'DATOS DEL PACIENTE (JSON) — CHECKPOINT FINAL, anamnesis completa con clarificaciones:',
            JSON.stringify(PACIENTE_COMPLETO),
            '',
            'SCHEMA DE RESPUESTA OBLIGATORIO (JSON Schema):',
            JSON.stringify(RESPONSE_SCHEMA),
            '',
            'Responde UNICAMENTE con un JSON que cumpla este schema. Sin texto adicional.',
          ].join('\n'),
        }],
      }],
      generationConfig: {
        temperature: 0,
        seed: 1,
        responseMimeType: 'application/json',
      },
    }),
  })

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    console.error(`\n❌ Gemini respondió ${response.status}:`, JSON.stringify(err, null, 2))
    process.exit(1)
  }

  const payload = await response.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
  }
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    console.error('\n❌ Sin texto:', JSON.stringify(payload, null, 2))
    process.exit(1)
  }

  const r = JSON.parse(text)
  const tokens = payload.usageMetadata

  console.log(`\n✓ Respuesta en ${elapsed}s | Tokens: ${tokens?.promptTokenCount ?? '?'} + ${tokens?.candidatesTokenCount ?? '?'} = ${tokens?.totalTokenCount ?? '?'}`)

  // ─── SIMULACIÓN DE PDF ─────────────────────────────────────────────

  console.log('\n' + '═'.repeat(70))
  console.log('  HISTORIA CLÍNICA — VISTA PDF')
  console.log('═'.repeat(70))

  console.log('\n┌─────────────────────────────────────────────────────────────────┐')
  console.log('│  HISTORIA CLÍNICA — María González                             │')
  console.log('│  Fecha: 2026-03-28                                             │')
  console.log('└─────────────────────────────────────────────────────────────────┘')

  console.log('\n── DATOS PERSONALES ──────────────────────────────────────────────')
  console.log(`   Edad: ${r.normalizedOpenFields?.ageMonths ? Math.floor(r.normalizedOpenFields.ageMonths / 12) : '?'} años`)
  console.log(`   Ocupación: ${PACIENTE_COMPLETO.sourceSections[0].data.ocupacion_actual}`)
  console.log(`   Categoría: ${r.normalizedOpenFields?.occupationCategory}`)

  console.log('\n── MOTIVO DE CONSULTA ────────────────────────────────────────────')
  console.log(`   ${r.chiefComplaint?.normalizedMedicalText}`)

  console.log('\n── ENFERMEDAD ACTUAL ─────────────────────────────────────────────')
  // Wrap narrative at ~80 chars
  const narrative = r.presentIllness?.clinicalNarrative ?? ''
  const words = narrative.split(' ')
  let line = '   '
  for (const w of words) {
    if (line.length + w.length > 75) {
      console.log(line)
      line = '   ' + w
    } else {
      line += (line.trim() ? ' ' : '') + w
    }
  }
  if (line.trim()) console.log(line)

  if (r.presentIllness?.chronology) console.log(`\n   Cronología: ${r.presentIllness.chronology}`)
  if (r.presentIllness?.severity) console.log(`   Severidad: ${r.presentIllness.severity}`)
  if (r.presentIllness?.associatedSymptoms?.length > 0) {
    console.log(`   Síntomas asociados: ${r.presentIllness.associatedSymptoms.join(', ')}`)
  }
  if (r.presentIllness?.aggravatingFactors?.length > 0) {
    console.log(`   Factores agravantes: ${r.presentIllness.aggravatingFactors.join(', ')}`)
  }
  if (r.presentIllness?.relievingFactors?.length > 0) {
    console.log(`   Factores aliviantes: ${r.presentIllness.relievingFactors.join(', ')}`)
  }
  if (r.presentIllness?.treatmentsTried?.length > 0) {
    console.log(`   Tratamientos probados: ${r.presentIllness.treatmentsTried.join(', ')}`)
  }

  console.log('\n── ANTECEDENTES PERSONALES ───────────────────────────────────────')
  if (r.personalHistory?.pathological?.length > 0) {
    console.log('   Patológicos:')
    for (const p of r.personalHistory.pathological) console.log(`     • ${p}`)
  }
  if (r.personalHistory?.physiological?.length > 0) {
    console.log('   Fisiológicos:')
    for (const p of r.personalHistory.physiological) console.log(`     • ${p}`)
  }
  if (r.personalHistory?.lifestyleAndContext?.length > 0) {
    console.log('   Estilo de vida:')
    for (const p of r.personalHistory.lifestyleAndContext) console.log(`     • ${p}`)
  }

  console.log('\n── ALERGIAS ─────────────────────────────────────────────────────')
  console.log(`   Grupos: [${r.normalizedOpenFields?.allergyGroups?.join(', ')}]`)
  console.log(`   Detalle: ${PACIENTE_COMPLETO.sourceSections[4].data.lista_alergias}`)

  console.log('\n── MEDICACIÓN ACTUAL ────────────────────────────────────────────')
  console.log(`   Familias: [${r.normalizedOpenFields?.medicationFamilies?.join(', ')}]`)

  console.log('\n── ANTECEDENTES FAMILIARES ───────────────────────────────────────')
  if (r.familyHistory?.length > 0) {
    for (const f of r.familyHistory) console.log(`   • ${f}`)
  }
  console.log(`   Padre: ${r.normalizedOpenFields?.fatherDeathCause}`)
  console.log(`   Madre: ${r.normalizedOpenFields?.motherDeathCause}`)

  console.log('\n── REVISIÓN POR SISTEMAS ─────────────────────────────────────────')
  const ros = r.reviewOfSystems
  if (ros?.cardiovascular?.length > 0) {
    console.log(`   Cardiovascular: ${ros.cardiovascular.join(', ')}`)
  }
  if (ros?.respiratory?.length > 0) {
    console.log(`   Respiratorio: ${ros.respiratory.join(', ')}`)
  }
  if (ros?.digestive?.length > 0) {
    console.log(`   Digestivo: ${ros.digestive.join(', ')}`)
  }
  if (ros?.genitourinary?.length > 0) {
    console.log(`   Genitourinario: ${ros.genitourinary.join(', ')}`)
  }

  // ─── SECCIÓN EXTRA: lo que Gemini agregó ───────────────────────────

  console.log('\n' + '═'.repeat(70))
  console.log('  ANÁLISIS DE VALOR AGREGADO POR GEMINI')
  console.log('═'.repeat(70))

  console.log('\n── COBERTURA ARGENTÉ ─────────────────────────────────────────────')
  if (r.argenteCoverage?.adequatelyCovered?.length > 0) {
    console.log('   ✅ Cubiertas:')
    for (const s of r.argenteCoverage.adequatelyCovered) console.log(`      • ${s}`)
  }
  if (r.argenteCoverage?.weakOrMissing?.length > 0) {
    console.log('   ❌ Aún débiles:')
    for (const s of r.argenteCoverage.weakOrMissing) console.log(`      • ${s}`)
  } else {
    console.log('   ✅ Todas las secciones cubiertas adecuadamente.')
  }

  if (r.qualityAlerts?.length > 0) {
    console.log('\n── ALERTAS DE CALIDAD ────────────────────────────────────────────')
    for (const a of r.qualityAlerts) {
      console.log(`   [${a.severity.toUpperCase()}] ${a.message}`)
    }
  }

  if (r.dataIntegrity?.missingCriticalData?.length > 0) {
    console.log('\n── DATOS CRÍTICOS FALTANTES ──────────────────────────────────────')
    for (const m of r.dataIntegrity.missingCriticalData) console.log(`   • ${m}`)
  }

  if (r.safetyFlags?.length > 0) {
    console.log('\n── SAFETY FLAGS ─────────────────────────────────────────────────')
    for (const f of r.safetyFlags) console.log(`   🛡️  ${f}`)
  }

  if (r.clinicianQuestions?.length > 0) {
    console.log('\n── PREGUNTAS SUGERIDAS PARA EL MÉDICO ───────────────────────────')
    for (const q of r.clinicianQuestions) console.log(`   ? ${q}`)
  }

  if (r.presentIllness?.missingData?.length > 0) {
    console.log('\n── DATOS AÚN FALTANTES EN ENFERMEDAD ACTUAL ─────────────────────')
    for (const d of r.presentIllness.missingData) console.log(`   • ${d}`)
  }

  // ─── Comparativa parcial vs final ──────────────────────────────────

  console.log('\n' + '═'.repeat(70))
  console.log('  IMPACTO DE LAS 3 PREGUNTAS')
  console.log('═'.repeat(70))
  console.log('\n   Antes (parcial, 5 secciones):')
  console.log('     - Enfermedad actual: sin intensidad, sin duración, sin síntomas asociados')
  console.log('     - Antecedentes familiares: completamente ausentes')
  console.log('     - Revisión por sistemas: ausente')
  console.log('\n   Después (final, 11 secciones + 3 clarificaciones):')
  console.log(`     - Intensidad: 6-7/10, picos de 8/10`)
  console.log(`     - Duración: 4-5 horas sin medicación`)
  console.log(`     - Síntomas asociados: ${r.presentIllness?.associatedSymptoms?.join(', ') || 'ver arriba'}`)
  console.log(`     - Cobertura: ${r.argenteCoverage?.adequatelyCovered?.length ?? 0} secciones cubiertas`)
  console.log(`     - Débiles: ${r.argenteCoverage?.weakOrMissing?.length ?? 0} secciones`)
  console.log()
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
