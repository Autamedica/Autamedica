import { jsPDF } from 'jspdf'

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

export function generatePsychiatryIntakePdf(input: PsychiatryIntakePdfInput): PsychiatryIntakePdfResult {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = 210
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  let y = 18

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
    patName = 'Paciente no especificado (Requiere verificación previa)'
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
  const motivo = extractVal(flatData, ['motivo_consulta', 'motivoConsulta']) || 'No especificado'
  const diagText = extractVal(flatData, ['diagnostico_texto']) || 'Sin diagnóstico reportado'
  const meds = extractVal(flatData, ['medicacion_actual']) || 'Sin medicación reportada'
  const dosis = extractVal(flatData, ['dosis_actual']) || 'Dosis no especificada'
  const prescriptor = extractVal(flatData, ['prescriptor_actual']) || 'No especificado'
  
  const response = extractVal(flatData, ['respuesta_previa_estimulantes']) || 'Sin reporte de respuesta'
  const symptomRelief = extractVal(flatData, ['relato_sintomas']) || 'Sin reporte sintomático'
  const functionalImpact = extractVal(flatData, ['impacto_estudio_trabajo']) || 'No descripto'

  const insomnia = extractBool(flatData, 'insomnio_actual')
  const chestPain = extractBool(flatData, 'dolor_pecho')
  const panic = extractBool(flatData, 'crisis_panico')
  const selfHarm = extractBool(flatData, 'ideas_autolesion')
  
  // NUEVA LÓGICA DE INCERTIDUMBRE (Reconciliación de medicación)
  const prescriptorLower = prescriptor.toLowerCase()
  let prescriberStatus = 'verified'
  if (prescriptorLower.includes('no ') || prescriptorLower.includes('recuerdo') || prescriptorLower.includes('ningun') || prescriptor === 'No especificado' || prescriptorLower.length < 4) {
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
  
  let sintesisTexto = `Paciente se presenta refiriendo como motivo principal: "${motivo}". Menciona diagnóstico previo de ${diagText}.`
  
  if (meds !== 'Sin medicación reportada') {
    sintesisTexto += `\nPaciente refiere uso actual de ${meds} con beneficio subjetivo reportado.`
    
    if (prescriberStatus === 'unknown') {
      sintesisTexto += ` No recuerda el profesional prescriptor o la información brindada es insuficiente.`
    } else {
      sintesisTexto += ` Refiere haber sido indicado por: ${prescriptor} (Información pendiente de verificación documental).`
    }

    if (doseCategory === 'imprecise') {
      sintesisTexto += ` La dosis reportada (${dosis}) carece de precisión clínica y requiere confirmación.`
    } else if (doseCategory === 'extraordinary') {
      sintesisTexto += ` La dosis reportada (${dosis}) resulta extraordinaria y excede márgenes de uso rutinario, exigiendo revisión.`
    } else {
      sintesisTexto += ` Dosis reportada: ${dosis}.`
    }
  } else {
    sintesisTexto += `\nNo reporta tratamiento psicofarmacológico actual.`
  }

  if (requiresClinicianReview) {
    sintesisTexto += `\n\nATENCIÓN: Se recomienda verificación activa de antecedente farmacológico antes de documentar continuidad terapéutica o prescribir.`
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
  
  const funcionalidadTexto = `En cuanto al alivio de síntomas, la paciente refiere la siguiente experiencia subjetiva: "${symptomRelief}".
Sobre el impacto residual en su rutina (estudio, trabajo o dinámica en el hogar) expone: "${functionalImpact}".
De manera global, describe su respuesta previa a la pauta farmacológica como: "${response}".`
  
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
  
  let riskText = 'El paciente negó dolor torácico asociado al uso, crisis de pánico y descartó ideas de autolesión actuales.'
  const activeRisks = []
  if (chestPain) activeRisks.push('dolor torácico')
  if (panic) activeRisks.push('crisis de pánico u opresión ansiosa severa')
  if (selfHarm) activeRisks.push('ideación suicida o de autolesión')
  
  if (activeRisks.length > 0) {
    riskText = `ALERTA DE SEGURIDAD: El paciente reportó explícitamente los siguientes síntomas de alto riesgo: ${activeRisks.join(', ')}.`
  }

  const sleepWarning = insomnia 
    ? 'Se constata reporte de insomnio actual o alteración severa del ciclo sueño-vigilia que requiere exploración clínica prioritaria.' 
    : 'No refiere insomnio clínico significativo secundario la medicación.'
  
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
  
  if (prescriberStatus === 'unknown') {
    alerts.push('• Reconciliación Farmacológica Pendiente: Prescriptor no identificable. NO autogenerar conclusión terapéutica cerrada. Solicitar evidencia complementaria (recetario previo, caja/blíster, HC previa) antes de emitir recetas.')
  }
  if (doseCategory === 'extraordinary') {
    alerts.push(`• Dosis Extraordinaria Reportada (${numericDose} mg): Fuera de los límites farmacológicos rutinarios aprobados de uso (máx ~60-100mg/día). NO renovar a ciegas. Tratar como dato a reconciliar urgente por riesgo de sobredosificación, mal uso o error de captura.`)
  } else if (doseCategory === 'imprecise') {
    alerts.push('• Evaluación de Dosis Incierta: Relato de dosis inexacta (e.g., "pastillas"). Riesgo de mala adherencia o abstinencia aguda. Indagar presentación (IR/LA) y gramaje exacto.')
  }
  
  // PUENTE CLÍNICO DE CONTINGENCIA
  if (prescriberStatus === 'unknown' && (diagText.toLowerCase().includes('tdah') || meds.toLowerCase().includes('metilfenidato') || meds.toLowerCase().includes('lisdexanfetamina') || meds.toLowerCase().includes('estimulante'))) {
    alerts.push('• Protocolo de Reducción de Daños (Puente Clínico): Ante medicación controlada con prescripción incierta pero alto riesgo de síndrome de retirada (abstención/depresión), NO discontinuar abruptamente. Proveer RECETA PUENTE DE TRANSICIÓN corta (ej. 7 a 14 días), con dosis base segura, condicionada a presentación de evidencia (envase, receta) y monitoreo estricto.')
  }
  if (insomnia || sleepInconsistency) {
    alerts.push('• Evaluación de Sueño Confusa / Severa: Reporte discordante o severo sobre la calidad de horas de sueño ("insomnio" sumado a reportes extensos de dormir). Evaluar hipótesis de efecto rebote o depresión comórbida.')
  }
  if (chestPain || panic || selfHarm) {
    alerts.push('• Riesgo Cardio/Psiquiátrico: Presencia de marcadores de alarma (Pánico, Dolor de pecho, Autolesión). Obligatorio posponer escalada de dosis empírica hasta interconsulta neurológica o cardiovascular.')
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
      const lines = doc.splitTextToSize(`• ${cleanKey}: ${String(flatData[k])}`, contentWidth)
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
  const disclaimer = doc.splitTextToSize('NOTA REGLAMENTARIA: Este documento es una automatización preliminar autogenerada a partir de las declaraciones subjetivas del paciente a través del portal de Triage Digital (Anamnesis asincrónica). No constituye un diagnóstico médico firme, no certifica discapacidad, ni reemplaza en ninguna medida el criterio soberano del profesional médico psiquiatra tratante durante la consulta clínica en vivo.', contentWidth)
  for (const line of disclaimer) {
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
