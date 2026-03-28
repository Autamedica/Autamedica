/**
 * Service: PDF generation for medical consultation reports.
 *
 * Converts a SOAP-format medical record into a professional PDF document.
 * Uses jsPDF (pure JS, edge-compatible — no Node APIs required).
 *
 * Architecture: Capa 6 (Service backend) — receives typed data from Controller,
 * delegates DB access to Repository. Never touches Supabase directly.
 */
import { jsPDF } from 'jspdf'
import { logger } from '@autamedica/shared'
import {
  PAGE_WIDTH, MARGIN_LEFT, MARGIN_RIGHT, CONTENT_WIDTH, LINE_HEIGHT,
  SECTION_NAMES, ACCUMULATED_FIELDS, FIELD_LABELS, formatDate,
} from './pdf-report-config'

export interface PdfReportInput {
  record: {
    id: string
    title: string
    type: string
    content: Record<string, unknown>
    date_recorded: string | null
    created_at: string | null
  }
  patient: {
    name: string
    age: number | null
    gender: string | null
  }
  doctor: {
    name: string
    specialty: string | null
    license: string | null
  } | null
}

export interface PdfResult {
  buffer: Uint8Array
  filename: string
}


/**
 * Generates a professional medical report PDF from SOAP content.
 */
export function generateConsultationPdf(input: PdfReportInput): PdfResult {
  const { record, patient, doctor } = input
  const content = record.content as {
    subjective?: string
    objective?: string
    assessment?: string
    plan?: string
    chiefComplaint?: string | null
    differentialDiagnosis?: string[]
    followUpRecommendations?: string[]
    doctorNotes?: string | null
    aiGenerated?: boolean
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 20

  const addPage = () => {
    doc.addPage()
    y = 20
  }

  const checkPageBreak = (needed: number) => {
    if (y + needed > 270) addPage()
  }

  // --- Header ---
  doc.setFillColor(16, 95, 67) // emerald-800
  doc.rect(0, 0, PAGE_WIDTH, 35, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('AutaMedica', MARGIN_LEFT, 15)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Informe Médico de Consulta', MARGIN_LEFT, 23)

  doc.setFontSize(8)
  doc.text(`Documento generado: ${formatDate(new Date().toISOString())}`, MARGIN_LEFT, 30)

  // Document ID (right-aligned)
  doc.setFontSize(7)
  doc.text(`ID: ${record.id.slice(0, 8)}`, PAGE_WIDTH - MARGIN_RIGHT, 30, { align: 'right' })

  y = 45

  // --- Patient & Doctor Info ---
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('PACIENTE', MARGIN_LEFT, y)

  doc.setFont('helvetica', 'normal')
  y += LINE_HEIGHT
  doc.text(`Nombre: ${patient.name}`, MARGIN_LEFT, y)
  if (patient.age) {
    doc.text(`Edad: ${patient.age} años`, MARGIN_LEFT + 90, y)
  }
  if (patient.gender) {
    y += LINE_HEIGHT
    doc.text(`Género: ${patient.gender}`, MARGIN_LEFT, y)
  }

  y += LINE_HEIGHT + 2

  if (doctor) {
    doc.setFont('helvetica', 'bold')
    doc.text('PROFESIONAL', MARGIN_LEFT, y)
    doc.setFont('helvetica', 'normal')
    y += LINE_HEIGHT
    doc.text(`Dr/a. ${doctor.name}`, MARGIN_LEFT, y)
    if (doctor.specialty) {
      doc.text(`Especialidad: ${doctor.specialty}`, MARGIN_LEFT + 90, y)
    }
    if (doctor.license) {
      y += LINE_HEIGHT
      doc.text(`Matrícula: ${doctor.license}`, MARGIN_LEFT, y)
    }
    y += LINE_HEIGHT + 2
  }

  doc.text(`Fecha de consulta: ${formatDate(record.date_recorded ?? record.created_at)}`, MARGIN_LEFT, y)

  y += LINE_HEIGHT + 4

  // Separator line
  doc.setDrawColor(200, 200, 200)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 8

  // --- SOAP Sections ---
  const soapSections: { label: string; key: string; icon: string }[] = [
    { label: 'S — SUBJETIVO', key: 'subjective', icon: '🗣' },
    { label: 'O — OBJETIVO', key: 'objective', icon: '🔍' },
    { label: 'A — EVALUACIÓN', key: 'assessment', icon: '📋' },
    { label: 'P — PLAN', key: 'plan', icon: '📌' },
  ]

  for (const section of soapSections) {
    const text = (content[section.key as keyof typeof content] as string) ?? ''
    if (!text) continue

    checkPageBreak(30)

    // Section header
    doc.setFillColor(245, 245, 245)
    doc.rect(MARGIN_LEFT, y - 4, CONTENT_WIDTH, 8, 'F')
    doc.setTextColor(16, 95, 67)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(section.label, MARGIN_LEFT + 2, y + 1)
    y += 10

    // Section body
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')

    const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 4)
    for (const line of lines) {
      checkPageBreak(LINE_HEIGHT)
      doc.text(line, MARGIN_LEFT + 2, y)
      y += LINE_HEIGHT
    }
    y += 6
  }

  // --- Chief Complaint ---
  if (content.chiefComplaint) {
    checkPageBreak(20)
    doc.setTextColor(16, 95, 67)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('MOTIVO DE CONSULTA', MARGIN_LEFT, y)
    y += LINE_HEIGHT + 2
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(content.chiefComplaint, CONTENT_WIDTH)
    for (const line of lines) {
      checkPageBreak(LINE_HEIGHT)
      doc.text(line, MARGIN_LEFT + 2, y)
      y += LINE_HEIGHT
    }
    y += 6
  }

  // --- Differential Diagnosis ---
  if (content.differentialDiagnosis?.length) {
    checkPageBreak(20)
    doc.setTextColor(16, 95, 67)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('DIAGNÓSTICOS DIFERENCIALES', MARGIN_LEFT, y)
    y += LINE_HEIGHT + 2
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    for (const dx of content.differentialDiagnosis) {
      checkPageBreak(LINE_HEIGHT)
      doc.text(`- ${dx}`, MARGIN_LEFT + 4, y)
      y += LINE_HEIGHT
    }
    y += 4
  }

  // --- Follow-up ---
  if (content.followUpRecommendations?.length) {
    checkPageBreak(20)
    doc.setTextColor(16, 95, 67)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('RECOMENDACIONES DE SEGUIMIENTO', MARGIN_LEFT, y)
    y += LINE_HEIGHT + 2
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    for (const rec of content.followUpRecommendations) {
      checkPageBreak(LINE_HEIGHT)
      doc.text(`- ${rec}`, MARGIN_LEFT + 4, y)
      y += LINE_HEIGHT
    }
    y += 4
  }

  // --- Doctor Notes ---
  if (content.doctorNotes) {
    checkPageBreak(20)
    doc.setTextColor(16, 95, 67)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('NOTAS DEL PROFESIONAL', MARGIN_LEFT, y)
    y += LINE_HEIGHT + 2
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(content.doctorNotes, CONTENT_WIDTH)
    for (const line of lines) {
      checkPageBreak(LINE_HEIGHT)
      doc.text(line, MARGIN_LEFT + 2, y)
      y += LINE_HEIGHT
    }
    y += 4
  }

  // --- Footer ---
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200)
    doc.line(MARGIN_LEFT, 280, PAGE_WIDTH - MARGIN_RIGHT, 280)

    doc.setTextColor(150, 150, 150)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(
      'Documento confidencial — Ley 26.529 de Derechos del Paciente',
      MARGIN_LEFT,
      285,
    )
    doc.text(
      `Página ${i} de ${pageCount}`,
      PAGE_WIDTH - MARGIN_RIGHT,
      285,
      { align: 'right' },
    )

    if (content.aiGenerated) {
      doc.text(
        'Informe generado con asistencia de IA — Revisado por profesional médico',
        MARGIN_LEFT,
        289,
      )
    }
  }

  const buffer = doc.output('arraybuffer')

  const dateSlug = (record.date_recorded ?? record.created_at ?? '')
    .slice(0, 10)
    .replace(/-/g, '')
  const filename = `informe-medico-${dateSlug}-${record.id.slice(0, 8)}.pdf`

  logger.info('[PdfReportService] Generated PDF', {
    recordId: record.id,
    pages: pageCount,
    bytes: buffer.byteLength,
  })

  return {
    buffer: new Uint8Array(buffer),
    filename,
  }
}

// ============================================================
// Anamnesis PDF — Historia clínica del paciente
// ============================================================

export interface AnamnesisPdfVersion {
  versionNumber: number
  trigger: 'initial' | 'update' | 'review'
  relevance: string | null
  changesSummary: { added: string[]; modified: string[]; unchanged: string[] } | null
  createdAt: string
}

export interface AnamnesisPdfInput {
  patient: {
    name: string
    age: number | null
    gender: string | null
  }
  anamnesis: {
    id: string
    completedAt: string | null
    completionPercentage: number
  }
  version?: AnamnesisPdfVersion | null
  extraction: {
    chiefComplaint?: { rawText?: string | null; normalizedMedicalText?: string | null } | null
    presentIllness?: { clinicalNarrative?: string; chronology?: string | null; severity?: string | null; associatedSymptoms?: string[]; aggravatingFactors?: string[]; relievingFactors?: string[]; treatmentsTried?: string[] } | null
    personalHistory?: { physiological?: string[]; pathological?: string[]; lifestyleAndContext?: string[] } | null
    familyHistory?: string[] | null
    reviewOfSystems?: Record<string, string[]> | null
    argenteCoverage?: { adequatelyCovered?: string[]; weakOrMissing?: string[] } | null
    nextQuestions?: { question: string; rationale: string; priority: string }[] | null
    safetyFlags?: string[] | null
    normalizedOpenFields?: Record<string, unknown> | null
  } | null
  sections: { section: string; data: Record<string, unknown>; completed: boolean }[]
}


export function generateAnamnesisPdf(input: AnamnesisPdfInput): PdfResult {
  const { patient, anamnesis, version, extraction, sections } = input
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 20

  const addPage = () => { doc.addPage(); y = 20 }
  const checkPageBreak = (needed: number) => { if (y + needed > 270) addPage() }

  const writeSection = (title: string, lines: string[]) => {
    if (lines.length === 0) return
    checkPageBreak(20)
    doc.setFillColor(245, 245, 245)
    doc.rect(MARGIN_LEFT, y - 4, CONTENT_WIDTH, 8, 'F')
    doc.setTextColor(16, 95, 67)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(title, MARGIN_LEFT + 2, y + 1)
    y += 10
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    for (const line of lines) {
      const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH - 4)
      for (const w of wrapped) {
        checkPageBreak(LINE_HEIGHT)
        doc.text(w, MARGIN_LEFT + 2, y)
        y += LINE_HEIGHT
      }
    }
    y += 4
  }

  const writeBullets = (title: string, items: string[]) => {
    if (items.length === 0) return
    writeSection(title, items.map(i => `- ${i}`))
  }

  // --- Header ---
  doc.setFillColor(16, 95, 67)
  doc.rect(0, 0, PAGE_WIDTH, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('AutaMedica', MARGIN_LEFT, 15)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Historia Clínica del Paciente', MARGIN_LEFT, 23)
  doc.setFontSize(8)
  doc.text(`Generado: ${formatDate(new Date().toISOString())}`, MARGIN_LEFT, 30)
  doc.text(`ID: ${anamnesis.id.slice(0, 8)}`, PAGE_WIDTH - MARGIN_RIGHT, 30, { align: 'right' })
  y = 45

  // --- Patient info ---
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('PACIENTE', MARGIN_LEFT, y)
  doc.setFont('helvetica', 'normal')
  y += LINE_HEIGHT
  doc.text(`Nombre: ${patient.name}`, MARGIN_LEFT, y)
  if (patient.age) doc.text(`Edad: ${patient.age} años`, MARGIN_LEFT + 90, y)
  y += LINE_HEIGHT
  if (patient.gender) doc.text(`Género: ${patient.gender}`, MARGIN_LEFT, y)
  doc.text(`Completada: ${formatDate(anamnesis.completedAt)}`, MARGIN_LEFT + 90, y)
  y += LINE_HEIGHT
  doc.text(`Progreso: ${anamnesis.completionPercentage}%`, MARGIN_LEFT, y)
  y += LINE_HEIGHT + 4

  // --- Version metadata ---
  if (version) {
    const RELEVANCE_LABELS: Record<string, string> = {
      routine: 'Rutina',
      new_symptom: 'Sintoma nuevo',
      follow_up: 'Seguimiento',
      emergency: 'Emergencia',
    }
    const TRIGGER_LABELS: Record<string, string> = {
      initial: 'Primera consulta',
      update: 'Actualizacion',
      review: 'Revision medica',
    }

    doc.setFillColor(230, 245, 255)
    doc.rect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, 16, 'F')
    doc.setTextColor(30, 80, 140)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`Version ${version.versionNumber}`, MARGIN_LEFT + 3, y + 2)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${TRIGGER_LABELS[version.trigger] ?? version.trigger} - ${formatDate(version.createdAt)}`,
      MARGIN_LEFT + 40, y + 2,
    )
    if (version.relevance) {
      doc.text(
        `[${RELEVANCE_LABELS[version.relevance] ?? version.relevance}]`,
        PAGE_WIDTH - MARGIN_RIGHT, y + 2, { align: 'right' },
      )
    }
    y += 8

    if (version.changesSummary) {
      doc.setFontSize(8)
      doc.setTextColor(60, 60, 60)
      const parts: string[] = []
      if (version.changesSummary.added.length > 0) {
        parts.push(`${version.changesSummary.added.length} nuevas`)
      }
      if (version.changesSummary.modified.length > 0) {
        parts.push(`${version.changesSummary.modified.length} actualizadas`)
      }
      if (version.changesSummary.unchanged.length > 0) {
        parts.push(`${version.changesSummary.unchanged.length} sin cambios`)
      }
      if (parts.length > 0) {
        doc.text(`Secciones: ${parts.join(', ')}`, MARGIN_LEFT + 3, y + 2)
      }
      y += 6
    }
    y += 4
  }

  doc.setDrawColor(200, 200, 200)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 8

  // --- Coverage summary (AutaMedica IA branding) ---
  if (extraction?.argenteCoverage) {
    checkPageBreak(30)
    doc.setTextColor(16, 95, 67)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('ANÁLISIS CLÍNICO — AutaMedica IA', MARGIN_LEFT, y)
    y += LINE_HEIGHT + 2
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')

    const adequate = extraction.argenteCoverage.adequatelyCovered ?? []
    const weak = extraction.argenteCoverage.weakOrMissing ?? []

    doc.setTextColor(80, 80, 80)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Areas cubiertas: ${adequate.length} de ${adequate.length + weak.length}`, MARGIN_LEFT + 2, y)
    y += LINE_HEIGHT

    for (const area of adequate) {
      checkPageBreak(5)
      doc.setTextColor(34, 139, 34)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      const label = SECTION_NAMES[area] ?? area
      doc.text(`[OK] ${label}`, MARGIN_LEFT + 4, y)
      y += 5
    }
    for (const area of weak) {
      checkPageBreak(5)
      doc.setTextColor(200, 120, 0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      const label = SECTION_NAMES[area] ?? area
      const truncated = label.length > 60 ? label.slice(0, 57) + '...' : label
      doc.text(`[!] ${truncated}`, MARGIN_LEFT + 4, y)
      y += 5
    }

    // Gaps box — compact
    if (weak.length > 0) {
      y += 3
      checkPageBreak(12 + weak.length * 5)
      doc.setFillColor(255, 248, 230)
      doc.rect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, 7 + weak.length * 5, 'F')
      doc.setTextColor(140, 90, 0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('Para completar tu historia clinica, tu medico necesita:', MARGIN_LEFT + 3, y + 1)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      for (const area of weak) {
        checkPageBreak(5)
        const gapLabel = SECTION_NAMES[area] ?? area
        const truncated = gapLabel.length > 70 ? gapLabel.slice(0, 67) + '...' : gapLabel
        doc.text(`- ${truncated}`, MARGIN_LEFT + 5, y)
        y += 5
      }
    }
    y += 5
    doc.setFontSize(9)
  }

  // --- Chief complaint ---
  if (extraction?.chiefComplaint?.normalizedMedicalText) {
    writeSection('MOTIVO DE CONSULTA', [extraction.chiefComplaint.normalizedMedicalText])
  }

  // --- Present illness ---
  if (extraction?.presentIllness?.clinicalNarrative) {
    const pi = extraction.presentIllness
    const lines: string[] = [pi.clinicalNarrative]
    if (pi.chronology) lines.push(`Cronología: ${pi.chronology}`)
    if (pi.severity) lines.push(`Severidad: ${pi.severity}`)
    if (pi.associatedSymptoms?.length) lines.push(`Síntomas asociados: ${pi.associatedSymptoms.join(', ')}`)
    if (pi.aggravatingFactors?.length) lines.push(`Agravantes: ${pi.aggravatingFactors.join(', ')}`)
    if (pi.relievingFactors?.length) lines.push(`Aliviantes: ${pi.relievingFactors.join(', ')}`)
    if (pi.treatmentsTried?.length) lines.push(`Tratamientos previos: ${pi.treatmentsTried.join(', ')}`)
    writeSection('ENFERMEDAD ACTUAL', lines)
  }

  // --- Personal history ---
  if (extraction?.personalHistory) {
    const ph = extraction.personalHistory
    const lines: string[] = []
    if (ph.physiological?.length) lines.push(`Fisiológicos: ${ph.physiological.join(', ')}`)
    if (ph.pathological?.length) lines.push(`Patológicos: ${ph.pathological.join(', ')}`)
    if (ph.lifestyleAndContext?.length) lines.push(`Estilo de vida: ${ph.lifestyleAndContext.join(', ')}`)
    writeSection('ANTECEDENTES PERSONALES', lines)
  }

  // --- Family history ---
  writeBullets('ANTECEDENTES FAMILIARES', extraction?.familyHistory ?? [])

  // --- Review of systems ---
  if (extraction?.reviewOfSystems) {
    const ros = extraction.reviewOfSystems
    const lines: string[] = []
    for (const [system, findings] of Object.entries(ros)) {
      if (Array.isArray(findings) && findings.length > 0) {
        lines.push(`${SECTION_NAMES[system] ?? system}: ${findings.join(', ')}`)
      }
    }
    writeSection('REVISIÓN POR SISTEMAS', lines)
  }

  // --- Safety flags ---
  if (extraction?.safetyFlags?.length) {
    checkPageBreak(20)
    doc.setTextColor(180, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('BANDERAS DE SEGURIDAD', MARGIN_LEFT, y)
    y += LINE_HEIGHT + 2
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    for (const flag of extraction.safetyFlags) {
      checkPageBreak(LINE_HEIGHT)
      doc.text(`- ${flag}`, MARGIN_LEFT + 4, y)
      y += LINE_HEIGHT
    }
    y += 4
  }

  // --- Raw sections (deduplicated, human labels, only unique fields per section) ---
  // Only show if extraction is missing (fallback) or as compact supplement
  const seenFields = new Set<string>()
  const sectionsWithUniqueData = sections.map(section => {
    const uniqueEntries = Object.entries(section.data)
      .filter(([key, v]) => {
        if (v === null || v === '' || v === undefined) return false
        if (ACCUMULATED_FIELDS.has(key)) return false
        if (v === true || v === false) {
          // Only show boolean fields that are clinically relevant (true = symptom present)
          if (v === false) return false
        }
        const fieldKey = `${key}:${JSON.stringify(v)}`
        if (seenFields.has(fieldKey)) return false
        seenFields.add(fieldKey)
        return true
      })
    return { ...section, uniqueEntries }
  }).filter(s => s.uniqueEntries.length > 0)

  if (sectionsWithUniqueData.length > 0) {
    checkPageBreak(15)
    doc.setTextColor(16, 95, 67)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('RESPUESTAS DEL PACIENTE', MARGIN_LEFT, y)
    y += LINE_HEIGHT + 4

    for (const section of sectionsWithUniqueData) {
      const label = SECTION_NAMES[section.section] ?? section.section
      checkPageBreak(15)
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(label, MARGIN_LEFT + 2, y)
      y += LINE_HEIGHT

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      for (const [key, value] of section.uniqueEntries) {
        const fieldLabel = FIELD_LABELS[key] ?? key.replace(/_/g, ' ')
        let displayValue: string
        if (Array.isArray(value)) {
          const items = value.filter(v => v !== 'ninguno' && v !== 'ninguna')
          if (items.length === 0) continue
          displayValue = items.join(', ')
        } else if (typeof value === 'boolean') {
          displayValue = value ? 'Sí' : 'No'
        } else {
          displayValue = String(value)
        }
        const text = `${fieldLabel}: ${displayValue}`
        const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH - 8)
        for (const w of wrapped) {
          checkPageBreak(LINE_HEIGHT)
          doc.text(w, MARGIN_LEFT + 6, y)
          y += LINE_HEIGHT
        }
      }
      y += 3
    }
  }

  // --- Footer ---
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200)
    doc.line(MARGIN_LEFT, 280, PAGE_WIDTH - MARGIN_RIGHT, 280)
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('Documento confidencial — Ley 26.529 de Derechos del Paciente', MARGIN_LEFT, 285)
    doc.text(`Página ${i} de ${pageCount}`, PAGE_WIDTH - MARGIN_RIGHT, 285, { align: 'right' })
    doc.text('Analizado por AutaMedica IA — Sujeta a validación médica profesional', MARGIN_LEFT, 289)
  }

  const buffer = doc.output('arraybuffer')
  const dateSlug = (anamnesis.completedAt ?? '').slice(0, 10).replace(/-/g, '')
  const filename = `historia-clinica-${dateSlug}-${anamnesis.id.slice(0, 8)}.pdf`

  logger.info('[PdfReportService] Generated anamnesis PDF', {
    anamnesisId: anamnesis.id,
    pages: pageCount,
    bytes: buffer.byteLength,
    hasExtraction: !!extraction,
  })

  return { buffer: new Uint8Array(buffer), filename }
}
