/**
 * Test: ¿Gemini agrega valor real en el checkpoint de anamnesis?
 *
 * Simula un paciente que completó los primeros 6 pasos con datos realistas
 * y llama directamente a Gemini para ver qué devuelve.
 *
 * Uso: cd ~/Autamedica && bun scripts/test-gemini-anamnesis.ts
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  ?? Bun.env.GEMINI_API_KEY
  ?? (() => { throw new Error('GEMINI_API_KEY no configurada') })()

const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// ─── Datos de paciente simulado (6 pasos completados) ────────────────────

const PACIENTE_SIMULADO = {
  version: 'anamnesis_extraction_v2',
  purpose: 'extract_structured_anamnesis_without_diagnosis',
  patient: {
    patientId: 'test-demo-001',
    patientLabel: 'María González',
    anamnesisStatus: 'in_progress',
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
    'Ocupación: contadora, 15 años en puesto actual.',
    'Motivo de consulta: dolor de cabeza frecuente desde hace 3 meses, peor por la tarde.',
    'Enfermedades previas: hipertensión arterial diagnosticada hace 2 años.',
    'Medicamentos: enalapril 10mg/día.',
    'Alergias: penicilina (ronchas generalizadas y dificultad para respirar).',
  ].join(' '),
  sourceSections: [
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
    {
      section: 'antecedentes_personales',
      data: {
        enfermedades_previas: 'Hipertensión arterial diagnosticada hace 2 años en un control de rutina. Me dijeron que tenía la presión alta y me dieron pastillas.',
        cirugias: 'Cesárea en 2015',
        internaciones: 'Solo la cesárea',
      },
      completed: true,
    },
    {
      section: 'medicamentos',
      data: {
        toma_medicamentos: true,
        lista_medicamentos: 'Enalapril 10mg, una vez al día a la mañana. A veces se me olvida los fines de semana.',
        automedicacion: 'Ibuprofeno 400mg para el dolor de cabeza, 2-3 veces por semana. Paracetamol 500mg cuando no tengo ibuprofeno.',
      },
      completed: true,
    },
    {
      section: 'alergias',
      data: {
        tiene_alergias: true,
        lista_alergias: 'Penicilina: la tomé de chica y me salieron ronchas en todo el cuerpo, se me hincharon los labios y me costaba respirar. Me llevaron a la guardia. Desde entonces nunca más tomé.',
      },
      completed: true,
    },
    // Paso 6 completado — los siguientes pasos (7-13) NO están completados
  ],
  bodySelections: [],
  clarificationTurns: [],
}

// ─── Schema (simplificado del original) ──────────────────────────────────

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
        clinicalNarrative: { type: 'string' },
        associatedSymptoms: { type: 'array', items: { type: 'string' } },
        missingData: { type: 'array', items: { type: 'string' } },
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
        missingCriticalData: { type: 'array', items: { type: 'string' } },
      },
    },
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
  '10. Responde exclusivamente en JSON valido y estricto.',
].join(' ')

// ─── Ejecución ───────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  TEST: ¿Gemini agrega valor en el checkpoint paso 6?   ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Modelo: ${GEMINI_MODEL}`)
  console.log(`Paciente: ${PACIENTE_SIMULADO.patient.patientLabel}`)
  console.log(`Secciones completadas: ${PACIENTE_SIMULADO.sourceSections.length}/13`)
  console.log()

  const startTime = performance.now()

  console.log('Enviando a Gemini...')
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
            'DATOS DEL PACIENTE (JSON):',
            JSON.stringify(PACIENTE_SIMULADO),
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
    console.error('\n❌ No se recibió texto de Gemini:', JSON.stringify(payload, null, 2))
    process.exit(1)
  }

  const result = JSON.parse(text)
  const tokens = payload.usageMetadata

  console.log(`\n✓ Respuesta en ${elapsed}s | Tokens: ${tokens?.promptTokenCount ?? '?'} prompt + ${tokens?.candidatesTokenCount ?? '?'} respuesta = ${tokens?.totalTokenCount ?? '?'} total`)

  // ─── EVALUACIÓN HONESTA ────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60))
  console.log('  RESULTADO CRUDO DE GEMINI')
  console.log('═'.repeat(60))

  // 1. Queja principal normalizada
  console.log('\n📋 QUEJA PRINCIPAL:')
  console.log(`   Raw: "${result.chiefComplaint?.rawText}"`)
  console.log(`   Normalizada: "${result.chiefComplaint?.normalizedMedicalText}"`)
  console.log(`   Código: ${result.normalizedOpenFields?.chiefComplaintCode}`)
  console.log(`   Mismatch contextual: ${result.chiefComplaint?.contextualMismatch}`)

  // 2. Narrativa clínica
  console.log('\n📝 ENFERMEDAD ACTUAL (narrativa clínica):')
  console.log(`   "${result.presentIllness?.clinicalNarrative}"`)
  if (result.presentIllness?.missingData?.length > 0) {
    console.log(`\n   ⚠ Datos faltantes detectados:`)
    for (const d of result.presentIllness.missingData) {
      console.log(`     - ${d}`)
    }
  }

  // 3. Campos normalizados
  console.log('\n🏷️  CAMPOS NORMALIZADOS:')
  const nf = result.normalizedOpenFields
  console.log(`   Edad (meses): ${nf?.ageMonths} (${nf?.ageMonths ? Math.floor(nf.ageMonths / 12) + ' años' : '?'})`)
  console.log(`   Ocupación: ${nf?.occupationCategory}`)
  console.log(`   Medicamentos: [${nf?.medicationFamilies?.join(', ')}]`)
  console.log(`   Alergias: [${nf?.allergyGroups?.join(', ')}]`)
  console.log(`   Red flags: [${nf?.redFlagCodes?.join(', ') || 'ninguna'}]`)

  // 4. Cobertura Argenté
  console.log('\n📊 COBERTURA ARGENTÉ (lo que realmente importa):')
  const cov = result.argenteCoverage
  if (cov?.adequatelyCovered?.length > 0) {
    console.log('   ✅ Cubiertas:')
    for (const s of cov.adequatelyCovered) console.log(`      - ${s}`)
  }
  if (cov?.weakOrMissing?.length > 0) {
    console.log('   ❌ Débiles/faltantes:')
    for (const s of cov.weakOrMissing) console.log(`      - ${s}`)
  }

  // 5. Alertas de calidad
  if (result.qualityAlerts?.length > 0) {
    console.log('\n🚨 ALERTAS DE CALIDAD:')
    for (const a of result.qualityAlerts) {
      console.log(`   [${a.severity.toUpperCase()}] ${a.message}`)
    }
  }

  // 6. Integridad de datos
  const di = result.dataIntegrity
  if (di?.contradictions?.length > 0 || di?.missingCriticalData?.length > 0) {
    console.log('\n🔍 INTEGRIDAD DE DATOS:')
    if (di.contradictions?.length > 0) {
      console.log('   Contradicciones:')
      for (const c of di.contradictions) console.log(`     - ${c}`)
    }
    if (di.missingCriticalData?.length > 0) {
      console.log('   Datos críticos faltantes:')
      for (const m of di.missingCriticalData) console.log(`     - ${m}`)
    }
  }

  // 7. Safety flags
  if (result.safetyFlags?.length > 0) {
    console.log('\n🛡️  SAFETY FLAGS:')
    for (const f of result.safetyFlags) console.log(`   - ${f}`)
  }

  // 8. PREGUNTAS PARA EL PACIENTE (esto es lo que ve el usuario)
  console.log('\n' + '═'.repeat(60))
  console.log('  PREGUNTAS QUE SE MOSTRARÍAN AL PACIENTE')
  console.log('═'.repeat(60))
  if (result.nextQuestions?.length > 0) {
    for (const q of result.nextQuestions) {
      console.log(`\n   [${q.priority.toUpperCase()}] ${q.question}`)
      console.log(`   Razón: ${q.rationale}`)
      console.log(`   Sección: ${q.targetSection} | Tipo: ${q.questionType}`)
    }
  } else {
    console.log('   (ninguna pregunta generada)')
  }

  // ─── VEREDICTO ─────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60))
  console.log('  VEREDICTO: ¿AGREGA VALOR?')
  console.log('═'.repeat(60))

  const scores: { label: string; ok: boolean; detail: string }[] = []

  // A. ¿Detectó las secciones faltantes correctamente?
  const expectedWeak = ['antecedentes_familiares', 'revision_sistemas']
  const actualWeak = cov?.weakOrMissing ?? []
  const detectedMissing = expectedWeak.filter(e => actualWeak.some((w: string) => w.toLowerCase().includes(e.replace('_', ' ')) || w.toLowerCase().includes(e)))
  scores.push({
    label: 'Detecta secciones faltantes',
    ok: detectedMissing.length > 0 || actualWeak.length >= 2,
    detail: `Esperadas: [${expectedWeak.join(', ')}] — Detectadas: [${actualWeak.join(', ')}]`,
  })

  // B. ¿Las preguntas son clínicamente relevantes (no genéricas)?
  const questions = result.nextQuestions ?? []
  const hasSpecificQuestions = questions.some((q: { question: string }) =>
    q.question.length > 20 && !q.question.includes('¿Algo más')
  )
  scores.push({
    label: 'Preguntas específicas (no genéricas)',
    ok: hasSpecificQuestions,
    detail: `${questions.length} preguntas, ${hasSpecificQuestions ? 'al menos 1 específica' : 'todas genéricas o vacías'}`,
  })

  // C. ¿Normalizó correctamente los campos clave?
  const correctAge = nf?.ageMonths && Math.abs(nf.ageMonths - 504) < 24 // ~42 años ± 2
  const correctAllergy = nf?.allergyGroups?.includes('beta_lactam')
  scores.push({
    label: 'Normalización correcta de campos',
    ok: Boolean(correctAge && correctAllergy),
    detail: `Edad: ${nf?.ageMonths} meses (esperado ~504) | Alergia: ${nf?.allergyGroups} (esperado beta_lactam)`,
  })

  // D. ¿No inventó diagnósticos ni red flags falsos?
  const redFlags = nf?.redFlagCodes ?? []
  const noFalseFlags = redFlags.length === 0 || redFlags.every((f: string) =>
    ['chest_pain_exertional', 'severe_progressive_pain'].includes(f) === false
  )
  scores.push({
    label: 'No inventa red flags',
    ok: noFalseFlags,
    detail: `Red flags: [${redFlags.join(', ') || 'ninguna'}]`,
  })

  // E. ¿Narrativa clínica es útil vs repetir lo mismo?
  const narrative = result.presentIllness?.clinicalNarrative ?? ''
  const addsValue = narrative.length > 100 && !narrative.includes('dolor de cabeza frecuente desde hace 3 meses')
  scores.push({
    label: 'Narrativa clínica reformulada (no copy-paste)',
    ok: addsValue || narrative.length > 150,
    detail: `${narrative.length} chars, ${addsValue ? 'reformulada' : 'posible copy-paste'}`,
  })

  // F. ¿Detectó la adherencia intermitente al enalapril?
  const detectsAdherence = JSON.stringify(result).toLowerCase().includes('adherencia')
    || JSON.stringify(result).toLowerCase().includes('olvida')
    || JSON.stringify(result).toLowerCase().includes('compliance')
    || JSON.stringify(result).toLowerCase().includes('intermitente')
  scores.push({
    label: 'Detecta adherencia intermitente (enalapril)',
    ok: detectsAdherence,
    detail: detectsAdherence ? 'Mencionado en algún campo' : 'No detectado — dato clínicamente relevante perdido',
  })

  console.log()
  let passed = 0
  for (const s of scores) {
    const icon = s.ok ? '✅' : '❌'
    console.log(`   ${icon} ${s.label}`)
    console.log(`      ${s.detail}`)
    if (s.ok) passed++
  }

  console.log(`\n   Score: ${passed}/${scores.length}`)
  console.log()

  if (passed >= 5) {
    console.log('   VEREDICTO: Gemini AGREGA VALOR real. La intervención mejora la calidad de la HC.')
  } else if (passed >= 3) {
    console.log('   VEREDICTO: Gemini agrega valor PARCIAL. Algunas detecciones útiles, otras fallan.')
  } else {
    console.log('   VEREDICTO: Gemini NO agrega valor suficiente. Considerar remover o cambiar el modelo.')
  }
  console.log()
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
