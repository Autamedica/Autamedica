import { jsPDF } from 'jspdf'

interface PsychiatryIntakePdfTriage {
  priority: 'routine' | 'priority' | 'urgent'
  reasons: string[]
  mandate: string
  suggestedAction: string
  references: string[]
}

interface PsychiatryIntakePdfInput {
  patient: {
    name: string
    age: number | null
    gender: string | null
  }
  intake: {
    id: string
    completionPercentage: number
    completedAt?: string | null
    updatedAt?: string | null
  }
  sections: Array<{
    section: string
    phase: string
    data: Record<string, unknown>
  }>
  triage?: Partial<PsychiatryIntakePdfTriage> | null
}

export interface PsychiatryIntakePdfResult {
  buffer: Uint8Array
  filename: string
}

function formatDate(value?: string | null): string {
  if (!value) return 'Fecha no registrada'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Helper para extraer datos de múltiples variaciones de naming (snake_case o camelCase)
function extractVal(data: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (data[k] !== undefined && data[k] !== null && data[k] !== '') {
      return String(data[k]).trim()
    }
  }
  return null
}

function extractBool(data: Record<string, unknown>, key: string): boolean {
  return data[key] === true || data[key] === 'true'
}

/** Sanatización de respuestas "basura" (no operativas clínicamente) */
function isGarbageValue(text: string | null | undefined): boolean {
  if (!text) return true
  const garbage = ['no', 'si', 'sí', 'nada', 'ninguno', 'ninguna', 'no se', 'no sé', 'nose', 'cuales?', 'cuáles?', 'los que ya tengo', 'sin pastilla', 'sin pastill']
  const clean = text.toLowerCase().trim().replace(/[.,!?]/g, '')
  return garbage.includes(clean) || clean.length < 2
}

function sanitizeText(text: string | null | undefined, fallback = 'Información no consignada'): string {
  if (!text || isGarbageValue(text)) return fallback
  return text.trim()
}

function normalizePdfTriage(triage: PsychiatryIntakePdfInput['triage']): PsychiatryIntakePdfTriage | null {
  if (!triage || typeof triage !== 'object') return null

  const priority = triage.priority
  if (priority !== 'routine' && priority !== 'priority' && priority !== 'urgent') {
    return null
  }

  const reasons = Array.isArray(triage.reasons)
    ? triage.reasons.filter((reason): reason is string => typeof reason === 'string' && reason.trim().length > 0)
    : []

  const references = Array.isArray(triage.references)
    ? triage.references.filter((reference): reference is string => typeof reference === 'string' && reference.trim().length > 0)
    : []

  return {
    priority,
    reasons,
    mandate: typeof triage.mandate === 'string' ? triage.mandate.trim() : '',
    suggestedAction: typeof triage.suggestedAction === 'string' ? triage.suggestedAction.trim() : '',
    references,
  }
}

/** Humanización de valores técnicos para el anexo */
function humanizeValue(key: string, value: unknown): string {
  const v = String(value || '').toLowerCase().trim()
  if (isGarbageValue(v)) {
    if (key === 'antecedentes_relevantes' || key === 'comentarios_finales') return 'No refiere información significativa'
    if (key === 'contraindicaciones') return 'No refiere contraindicaciones conocidas'
    return 'Sin reporte específico'
  }

  const maps: Record<string, string> = {
    'menos_apetito': 'Refiere disminución del apetito',
    'mas_apetito': 'Refiere aumento del apetito',
    'normal': 'Sin alteraciones significativas reportadas',
    'buena': 'Reporta adherencia adecuada',
    'irregular': 'Reporta dificultades en la adherencia',
  }

  return maps[v] || v
}

export function generatePsychiatryIntakePdf(input: PsychiatryIntakePdfInput): PsychiatryIntakePdfResult {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = 210
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  let y = 18
  const triage = normalizePdfTriage(input.triage)

  const addPage = () => {
    doc.addPage()
    y = 18
  }

  const checkPageBreak = (needed = 10) => {
    if (y + needed > 280) {
      addPage()
    }
  }

  // 1. Aplanar las secciones para extraer por nombre de variable, no por sección de DB
  const flatData: Record<string, unknown> = {}
  for (const section of input.sections) {
    Object.assign(flatData, section.data)
  }

  // HEADER (Premium Medical Design)
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, pageWidth, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('AutaMedica', margin, 12)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text('Evaluación Psiquiátrica de Seguimiento', margin, 20)
  
  y = 40

  // 2. IDENTIDAD DEL PACIENTE (Capa 1: Saneamiento)
  let patName = input.patient.name?.trim() || ''
  if (patName === 'null null' || patName.toLowerCase() === 'null' || patName === '') {
    patName = 'Paciente no identificado al momento de la generación automática del reporte'
  }

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(patName, margin, y)
  
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  
  const ageStr = input.patient.age != null ? `${input.patient.age} años` : 'Edad no consignada'
  const genderStr = input.patient.gender ? input.patient.gender : 'Género no consignado'
  const dateStr = formatDate(input.intake.completedAt ?? input.intake.updatedAt)
  
  doc.text(`${ageStr} | ${genderStr} | Documento generado: ${dateStr}`, margin, y)

  y += 10
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // VARIABLES CLAVE DE SÍNTESIS
  const motivo = sanitizeText(extractVal(flatData, ['motivo_consulta', 'motivoConsulta']), 'No especificado')
  const diagText = sanitizeText(extractVal(flatData, ['diagnostico_texto']), 'Sin diagnóstico reportado')
  const meds = sanitizeText(extractVal(flatData, ['medicacion_actual']), 'Sin medicación reportada')
  const dosis = sanitizeText(extractVal(flatData, ['dosis_actual']), 'Dosis no especificada')
  const prescriptor = sanitizeText(extractVal(flatData, ['prescriptor_actual']), 'No especificado')
  
  const response = sanitizeText(extractVal(flatData, ['respuesta_previa_estimulantes']), 'Sin reporte de respuesta')
  const symptomRelief = sanitizeText(extractVal(flatData, ['relato_sintomas']), 'Sin reporte sintomático')
  const functionalImpact = sanitizeText(extractVal(flatData, ['impacto_estudio_trabajo']), 'No descripto')

  const insomnia = extractBool(flatData, 'insomnio_actual')
  const chestPain = extractBool(flatData, 'dolor_pecho')
  const panic = extractBool(flatData, 'crisis_panico')
  const selfHarm = extractBool(flatData, 'ideas_autolesion')
  
  // NUEVA LÓGICA DE INCERTIDUMBRE (Reconciliación de medicación)
  const prescriptorLower = prescriptor.toLowerCase()
  let prescriberStatus = 'verified'
  if (prescriptor === 'No especificado' || prescriptorLower.includes('no ') || prescriptorLower.includes('recuerdo') || prescriptorLower.includes('ningun') || prescriptorLower.length < 4) {
    prescriberStatus = 'unknown' // paciente no refiere un médico claro
  } else {
    prescriberStatus = 'patient_reported_unverified' // refiere un nombre pero no hay foto receta subida
  }

  // Validación de Dosis (Límites farmacológicos rutinarios)
  const dosisLower = dosis.toLowerCase()
  const numericDoseMatch = dosisLower.match(/(\d+)/)
  const numericDose = numericDoseMatch ? parseInt(numericDoseMatch[1], 10) : 0
  let doseCategory = 'standard'

  if (numericDose >= 100) {
    doseCategory = 'extraordinary' // Dosis extraordinariamente alta (e.g. >100mg metilfenidato/lisdexanfetamina)
  } else if (dosisLower.includes('pastilla') || dosisLower.includes('comprimido') || dosisLower.includes('abuso') || dosisLower === 'dosis no especificada' || dosisLower === 'no se') {
    doseCategory = 'imprecise'
  }

  // Bandera de revisión obligatoria para continuidad
  const requiresClinicianReview = prescriberStatus === 'unknown' || doseCategory === 'imprecise' || doseCategory === 'extraordinary'

  // ---------- I. IMPRESIÓN CLÍNICA INICIAL (Capa 3: Redacción) ----------
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('I. IMPRESIÓN CLÍNICA INICIAL', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(51, 65, 85)
  
  let sintesisTexto = `La persona consultante se presenta refiriendo como motivo principal: "${motivo}". Menciona diagnóstico previo de ${diagText}.`
  
  const hasUncertainty = prescriberStatus === 'unknown' || doseCategory === 'imprecise' || doseCategory === 'extraordinary'

  if (meds !== 'Sin medicación reportada') {
    if (hasUncertainty) {
      sintesisTexto += `\nPaciente refiere antecedente de tratamiento con medicación psicotrópica (${meds}), observándose información actual incompleta o inconsistente sobre el esquema vigente.`
    } else {
      sintesisTexto += `\nPaciente refiere uso actual de ${meds} con beneficio subjetivo reportado.`
    }
    
    if (prescriberStatus === 'unknown') {
      sintesisTexto += ` No se dispone de información precisa sobre el profesional prescriptor original.`
    } else {
      sintesisTexto += ` Refiere seguimiento por: ${prescriptor} (Información sujeta a verificación documental).`
    }

    if (doseCategory === 'imprecise') {
      sintesisTexto += ` La dosis informada (${dosis}) resulta clínicamente imprecisa y requiere confirmación dirigida.`
    } else if (doseCategory === 'extraordinary') {
      sintesisTexto += ` La dosis reportada (${dosis}) resulta extraordinaria respecto a los márgenes de uso habitual, exigiendo revisión exhaustiva.`
    } else {
      sintesisTexto += ` Dosis reportada: ${dosis}.`
    }
  } else {
    sintesisTexto += `\nNo reporta tratamiento psicofarmacológico vigente al momento de la consulta.`
  }

  if (requiresClinicianReview) {
    sintesisTexto += `\n\nALERTA OPERATIVA: Se requiere RECONCILIACIÓN FARMACOLÓGICA PRIORITARIA (WHO, 2024) y resolución clínica el mismo día para asegurar la continuidad terapéutica segura.`
  }
  
  const sintesisLines = doc.splitTextToSize(sintesisTexto, contentWidth)
  for (const line of sintesisLines) {
    checkPageBreak(5)
    doc.text(line, margin, y)
    y += 5
  }
  y += 4

  // ---------- II. IMPACTO FUNCIONAL Y RESPUESTA ----------
  checkPageBreak(25)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('II. IMPACTO FUNCIONAL Y RESPUESTA SINTOMÁTICA', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(51, 65, 85)
  
  const subjectRef = input.patient.gender === 'Femenino' ? 'la paciente' : 
                    input.patient.gender === 'Masculino' ? 'el paciente' : 'la persona consultante'

  const funcionalidadTexto = `Respecto al alivio de síntomas, ${subjectRef} refiere la siguiente experiencia subjetiva: "${symptomRelief}".
Sobre el grado de impacto residual en su funcionamiento cotidiano (académico, laboral o convivencial), expone: "${functionalImpact}".
En términos globales, describe su respuesta previa a la estrategia farmacológica implementada como: "${response}".`
  
  const funcLines = doc.splitTextToSize(funcionalidadTexto, contentWidth)
  for (const line of funcLines) {
    checkPageBreak(5)
    doc.text(line, margin, y)
    y += 5
  }
  y += 4

  // ---------- III. EVALUACIÓN DE RIESGO ----------
  checkPageBreak(30)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('III. EVALUACIÓN DE RIESGO Y SEGURIDAD VITAL', margin, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  
  let riskText = `Respecto a marcadores de seguridad, ${subjectRef} niega dolor torácico asociado al tratamiento, crisis de pánico o ideación de autolesión en el período evaluado.`
  const activeRisks = []
  if (chestPain) activeRisks.push('dolor torácico')
  if (panic) activeRisks.push('crisis de pánico u opresión ansiosa severa')
  if (selfHarm) activeRisks.push('ideación suicida o conductas de autolesión')
  
  if (activeRisks.length > 0) {
    riskText = `ALERTA DE SEGURIDAD: Se reporta la presencia de los siguientes síntomas de riesgo clínico: ${activeRisks.join(', ')}.`
  }

  const sleepWarning = insomnia 
    ? 'Se constata reporte de alteración significativa del ciclo sueño-vigilia que requiere exploración clínica prioritaria.' 
    : 'No refiere insomnio clínico significativo al momento de la evaluación.'
  
  const riskLines = doc.splitTextToSize(`${riskText} ${sleepWarning}`, contentWidth)
  for (const line of riskLines) {
    checkPageBreak(5)
    doc.text(line, margin, y)
    y += 5
  }
  y += 8

  // ---------- IV. ALERTA Y SEMAFORIZACIÓN (Capa 4: Decisión y Flags) ----------
  // Incoherencia: Marca insomnio pero dice algo extraño sobre el tiempo durmiendo
  const sleepInconsistency = insomnia && (functionalImpact.toLowerCase().includes('duermo') || functionalImpact.toLowerCase().includes('sueño'))

  const alerts = []
  
  const isStimulant = diagText.toLowerCase().includes('tdah') || meds.toLowerCase().includes('metilfenidato') || meds.toLowerCase().includes('lisdexanfetamina') || meds.toLowerCase().includes('estimulante')

  if (isStimulant && (prescriberStatus === 'unknown' || doseCategory === 'imprecise')) {
    let msg = '• RESOLUCIÓN CLÍNICA PRIORITARIA (Protocolo de Continuidad Segura): Reporte de uso crónico de sustancias estimulantes con incertidumbre en el esquema o prescriptor. RIESGO: La discontinuación abrupta se asocia a síntomas de retirada, depresión reactiva y rebote sintomático (NHS, NICE). REGLA OPERATIVA: 1) Prohibido el abandono terapéutico pasivo. 2) Resolución clínica el mismo día. 3) Valorar esquema puente supervisado con dosis base segura según criterio médico.'
    if (doseCategory === 'extraordinary') {
      msg += ` PRECAUCIÓN DOSIS: El valor informado (${numericDose} mg) es inusualmente alto. NO se autoriza renovación automática total; requiere validación presencial urgente.`
    }
    alerts.push(msg)
  } else {
    if (prescriberStatus === 'unknown') {
      alerts.push('• Reconciliación Farmacológica Urgente: Se requiere reconstruir la historia farmacológica mediante fuentes adicionales (WHO) para evitar interrupciones en el tratamiento crónico.')
    }
    if (doseCategory === 'extraordinary') {
      alerts.push(`• Validación de Dosis Crítica (${numericDose} mg): Se detecta reporte fuera del rango convencional. Evaluación inmediata para descartar toxicidad o desvío terapéutico.`)
    }
  }

  if (doseCategory === 'imprecise') {
    alerts.push('• Evaluación de Esquema Impreciso: El relato de la medicación resulta inexacto (ej: "pastillas"). Riesgo elevado de error de medicación o síntomas de abstinencia. Indagar gramaje y presentación.')
  }

  if (insomnia || sleepInconsistency) {
    alerts.push('• Contradicción en Patrón de Sueño: Se observa inconsistencia entre el reporte de insomnio y la descripción de la rutina diaria. Evaluar posibles comorbilidades afectivas o efectos paradojales de la medicación.')
  }
  if (chestPain || panic || selfHarm) {
    alerts.push('• Hallazgo de Alarmas Cardio-Psiquiátricas: Presencia de síntomas severos que exigen posponer cualquier escalada de dosis y realizar una evaluación clínica focalizada en seguridad física y mental.')
  }

  if (alerts.length > 0) {
    checkPageBreak(25 + (alerts.length * 9))
    
    doc.setFillColor(254, 242, 242) // bg-red-50
    doc.setDrawColor(248, 113, 113) // border-red-400
    doc.setLineWidth(0.5)
    doc.rect(margin, y, contentWidth, 14 + (alerts.length * 8), 'FD')
    
    y += 8
    doc.setTextColor(220, 38, 38)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('IV. SEMAFORIZACIÓN Y ALERTAS CLÍNICAS (Requiere revisión)', margin + 4, y)
    
    y += 7
    doc.setTextColor(153, 27, 27)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    
    for (const alert of alerts) {
      const aLines = doc.splitTextToSize(alert, contentWidth - 8)
      for (const line of aLines) {
        doc.text(line, margin + 4, y)
        y += 5
      }
      y += 1
    }
    y += 8
  }

  // ---------- V. RESOLUCIÓN CLÍNICA Y MANTATOS SEGÚN GUÍAS ----------
  if (triage) {
    checkPageBreak(30)
    doc.setFillColor(254, 242, 242) // Light red background for urgent/priority
    if (triage.priority === 'routine') doc.setFillColor(240, 253, 244) // Light green
    
    doc.rect(margin - 2, y, contentWidth + 4, 35, 'F')
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('V. RESOLUCIÓN CLÍNICA Y MANDATOS OPERATIVOS', margin, y + 6)
    
    y += 12
    doc.setFontSize(9)
    doc.setTextColor(153, 27, 27)
    if (triage.priority === 'routine') doc.setTextColor(21, 128, 61)
    
    doc.text(`PRIORIDAD: ${triage.priority.toUpperCase()}`, margin, y)
    y += 5
    
    doc.setTextColor(51, 65, 85)
    doc.setFont('helvetica', 'bold')
    doc.text('MANDATO:', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(triage.mandate || 'Sin mandato específico', margin + 20, y)
    y += 5
    
    const actionLines = doc.splitTextToSize(`ACCIÓN SUGERIDA: ${triage.suggestedAction || 'Sin acción sugerida consignada'}`, contentWidth)
    for (const line of actionLines) {
      doc.text(line, margin, y)
      y += 4
    }
    
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('BASES DE LA INVESTIGACIÓN:', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 4
    if (triage.references.length === 0) {
      doc.text('• Sin referencias registradas en el estado clínico', margin + 2, y)
      y += 4
    } else {
      for (const ref of triage.references) {
        doc.text(`• ${ref}`, margin + 2, y)
        y += 4
      }
    }
    
    y += 6
  }

  // ---------- ANEXO: RESPUESTAS DIRECTAS ----------
  checkPageBreak(25)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10
  
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('ANEXO DE CONTEXTO: RESPUESTAS ADICIONALES RELEVANTES', margin, y)
  y += 6
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  
  const interestingKeys = [
    'ocupacion_actual', 'rutina_principal', 'apetito', 'adherencia', 
    'objetivos_tratamiento', 'comentarios_finales', 'antecedentes_relevantes', 'contraindicaciones'
  ]
  let hasAnexo = false
  
  for (const k of interestingKeys) {
    if (flatData[k]) {
      hasAnexo = true
      const cleanKey = k.replace(/_/g, ' ').toUpperCase()
      const humanized = humanizeValue(k, flatData[k])
      const lines = doc.splitTextToSize(`• ${cleanKey}: ${humanized}`, contentWidth)
      for (const line of lines) {
        checkPageBreak(5)
        doc.text(line, margin, y)
        y += 4
      }
    }
  }

  if (!hasAnexo) {
    doc.text('No hay respuestas adicionales registradas en el flujo actual.', margin, y)
    y += 5
  }

  // ---------- FOOTER JURÍDICO Y DISCLAIMER ----------
  y += 8
  checkPageBreak(20)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  const disclaimer = doc.splitTextToSize('NOTA REGLAMENTARIA: Este reporte constituye una síntesis preliminar para uso médico. BASES CLÍNICAS: El proceso de reconciliación farmacológica sigue las guías de la OMS (Standard Operating Protocol) para mitigar errores de medicación. El manejo de ADHD se alinea con NICE (NG87) y NHS, priorizando la continuidad terapéutica supervisada para evitar el daño por discontinuación abrupta. Este documento no reemplaza el juicio clínico final del profesional tratante.', contentWidth)
  for (const line of disclaimer) {
    checkPageBreak(5)
    doc.text(line, margin, y)
    y += 4
  }

  const pdfOutput = doc.output('arraybuffer')
  const dateSlug = (input.intake.completedAt ?? new Date().toISOString()).slice(0, 10).replace(/-/g, '')
  return {
    buffer: new Uint8Array(pdfOutput),
    filename: `evaluacion-psiquiatrica-${dateSlug}.pdf`,
  }
}
