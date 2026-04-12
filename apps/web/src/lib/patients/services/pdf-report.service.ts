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

  // ── Colors ──
  const DARK = { r: 23, g: 23, b: 23 }         // neutral-900
  const MID = { r: 115, g: 115, b: 115 }        // neutral-500
  const LIGHT = { r: 163, g: 163, b: 163 }      // neutral-400
  const ACCENT = { r: 14, g: 165, b: 233 }      // sky-500
  const DANGER = { r: 220, g: 38, b: 38 }       // red-600
  const AMBER = { r: 180, g: 120, b: 0 }        // amber accent
  const SUCCESS = { r: 22, g: 163, b: 74 }      // green-600
  const BG_LIGHT = { r: 250, g: 250, b: 250 }   // neutral-50
  const BG_AMBER = { r: 255, g: 251, b: 235 }   // amber-50

  const addPage = () => { doc.addPage(); y = 20 }
  const checkPageBreak = (needed: number) => { if (y + needed > 268) addPage() }

  const setColor = (c: { r: number; g: number; b: number }) => doc.setTextColor(c.r, c.g, c.b)

  const writeSection = (title: string, lines: string[]) => {
    if (lines.length === 0) return
    checkPageBreak(22)

    // Section header — dark pill style
    doc.setFillColor(DARK.r, DARK.g, DARK.b)
    doc.roundedRect(MARGIN_LEFT, y - 4, CONTENT_WIDTH, 9, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(title.toUpperCase(), MARGIN_LEFT + 4, y + 2)
    y += 12

    setColor(DARK)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    for (const line of lines) {
      const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH - 8)
      for (const w of wrapped) {
        checkPageBreak(LINE_HEIGHT)
        doc.text(w, MARGIN_LEFT + 4, y)
        y += LINE_HEIGHT
      }
    }
    y += 5
  }

  const writeBullets = (title: string, items: string[]) => {
    if (items.length === 0) return
    writeSection(title, items.map(i => `  ${i}`))
  }

  // ── Header — Dark editorial ──
  doc.setFillColor(DARK.r, DARK.g, DARK.b)
  doc.rect(0, 0, PAGE_WIDTH, 44, 'F')

  // Brand
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'normal')
  doc.text('AutaMedica', MARGIN_LEFT, 16)

  // Subtitle
  doc.setTextColor(255, 255, 255, 0.5)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Historia Clinica General', MARGIN_LEFT, 24)

  // Meta right-aligned
  doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setFontSize(8)
  doc.text(formatDate(new Date().toISOString()), PAGE_WIDTH - MARGIN_RIGHT, 16, { align: 'right' })
  doc.setTextColor(255, 255, 255, 0.4)
  doc.setFontSize(7)
  doc.text(`ID ${anamnesis.id.slice(0, 8)}`, PAGE_WIDTH - MARGIN_RIGHT, 22, { align: 'right' })

  // Completion bar in header
  const barY = 32
  const barW = 60
  const barH = 3
  const barX = PAGE_WIDTH - MARGIN_RIGHT - barW
  doc.setFillColor(255, 255, 255, 0.15)
  doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F')
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.roundedRect(barX, barY, barW * (anamnesis.completionPercentage / 100), barH, 1.5, 1.5, 'F')
  doc.setTextColor(255, 255, 255, 0.6)
  doc.setFontSize(7)
  doc.text(`${anamnesis.completionPercentage}% completada`, barX - 2, barY + 2.5, { align: 'right' })

  y = 54

  // ── Patient info — two-column layout ──
  setColor(LIGHT)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('PACIENTE', MARGIN_LEFT, y)

  y += 5
  setColor(DARK)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(patient.name, MARGIN_LEFT, y)

  doc.setFont('helvetica', 'normal')
  setColor(MID)
  doc.setFontSize(9)
  const infoFragments: string[] = []
  if (patient.age) infoFragments.push(`${patient.age} anos`)
  if (patient.gender) infoFragments.push(patient.gender)
  if (infoFragments.length > 0) {
    doc.text(infoFragments.join('  |  '), MARGIN_LEFT, y + 6)
  }

  // Right column — completion date
  setColor(LIGHT)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(anamnesis.completedAt ? `Completada: ${formatDate(anamnesis.completedAt)}` : 'En progreso', PAGE_WIDTH - MARGIN_RIGHT, y, { align: 'right' })

  y += 14

  // ── Version metadata ──
  if (version) {
    const TRIGGER_LABELS: Record<string, string> = {
      initial: 'Primera consulta', update: 'Actualizacion', review: 'Revision medica',
    }
    const RELEVANCE_LABELS: Record<string, string> = {
      routine: 'Rutina', new_symptom: 'Sintoma nuevo', follow_up: 'Seguimiento', emergency: 'Emergencia',
    }

    doc.setFillColor(BG_LIGHT.r, BG_LIGHT.g, BG_LIGHT.b)
    doc.roundedRect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, 12, 2, 2, 'F')
    setColor(ACCENT)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(`v${version.versionNumber}`, MARGIN_LEFT + 4, y + 3)
    setColor(MID)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${TRIGGER_LABELS[version.trigger] ?? version.trigger}  —  ${formatDate(version.createdAt)}`,
      MARGIN_LEFT + 16, y + 3,
    )
    if (version.relevance) {
      setColor(DARK)
      doc.text(
        RELEVANCE_LABELS[version.relevance] ?? version.relevance,
        PAGE_WIDTH - MARGIN_RIGHT - 4, y + 3, { align: 'right' },
      )
    }
    y += 14
  }

  // Thin separator
  doc.setDrawColor(230, 230, 230)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 8

  // ── Coverage summary ──
  if (extraction?.argenteCoverage) {
    const adequate = extraction.argenteCoverage.adequatelyCovered ?? []
    const weak = extraction.argenteCoverage.weakOrMissing ?? []
    const total = adequate.length + weak.length

    checkPageBreak(25 + (adequate.length + weak.length) * 5)

    setColor(DARK)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Analisis Clinico', MARGIN_LEFT, y)
    setColor(ACCENT)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`AutaMedica IA  —  ${adequate.length}/${total} areas cubiertas`, MARGIN_LEFT + 48, y)
    y += 8

    for (const area of adequate) {
      checkPageBreak(5)
      setColor(SUCCESS)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`+  ${SECTION_NAMES[area] ?? area}`, MARGIN_LEFT + 4, y)
      y += 5
    }
    for (const area of weak) {
      checkPageBreak(5)
      setColor(AMBER)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      const label = SECTION_NAMES[area] ?? area
      doc.text(`!  ${label.length > 60 ? label.slice(0, 57) + '...' : label}`, MARGIN_LEFT + 4, y)
      y += 5
    }

    if (weak.length > 0) {
      y += 2
      checkPageBreak(10 + weak.length * 5)
      doc.setFillColor(BG_AMBER.r, BG_AMBER.g, BG_AMBER.b)
      doc.roundedRect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, 7 + weak.length * 5, 2, 2, 'F')
      setColor(AMBER)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('Informacion pendiente para tu medico:', MARGIN_LEFT + 4, y + 1)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      for (const area of weak) {
        checkPageBreak(5)
        const gapLabel = SECTION_NAMES[area] ?? area
        doc.text(`-  ${gapLabel.length > 70 ? gapLabel.slice(0, 67) + '...' : gapLabel}`, MARGIN_LEFT + 6, y)
        y += 5
      }
    }
    y += 6
  }

  // ── Chief complaint ──
  if (extraction?.chiefComplaint?.normalizedMedicalText) {
    writeSection('Motivo de consulta', [extraction.chiefComplaint.normalizedMedicalText])
  }

  // ── Present illness ──
  if (extraction?.presentIllness?.clinicalNarrative) {
    const pi = extraction.presentIllness
    const lines: string[] = [pi.clinicalNarrative]
    if (pi.chronology) lines.push(`Cronologia: ${pi.chronology}`)
    if (pi.severity) lines.push(`Severidad: ${pi.severity}`)
    if (pi.associatedSymptoms?.length) lines.push(`Sintomas asociados: ${pi.associatedSymptoms.join(', ')}`)
    if (pi.aggravatingFactors?.length) lines.push(`Agravantes: ${pi.aggravatingFactors.join(', ')}`)
    if (pi.relievingFactors?.length) lines.push(`Aliviantes: ${pi.relievingFactors.join(', ')}`)
    if (pi.treatmentsTried?.length) lines.push(`Tratamientos previos: ${pi.treatmentsTried.join(', ')}`)
    writeSection('Enfermedad actual', lines)
  }

  // ── Personal history ──
  if (extraction?.personalHistory) {
    const ph = extraction.personalHistory
    const lines: string[] = []
    if (ph.physiological?.length) lines.push(`Fisiologicos: ${ph.physiological.join(', ')}`)
    if (ph.pathological?.length) lines.push(`Patologicos: ${ph.pathological.join(', ')}`)
    if (ph.lifestyleAndContext?.length) lines.push(`Estilo de vida: ${ph.lifestyleAndContext.join(', ')}`)
    writeSection('Antecedentes personales', lines)
  }

  // ── Family history ──
  writeBullets('Antecedentes familiares', extraction?.familyHistory ?? [])

  // ── Review of systems ──
  if (extraction?.reviewOfSystems) {
    const ros = extraction.reviewOfSystems
    const lines: string[] = []
    for (const [system, findings] of Object.entries(ros)) {
      if (Array.isArray(findings) && findings.length > 0) {
        lines.push(`${SECTION_NAMES[system] ?? system}: ${findings.join(', ')}`)
      }
    }
    writeSection('Revision por sistemas', lines)
  }

  // ── Safety flags ──
  if (extraction?.safetyFlags?.length) {
    checkPageBreak(20)
    doc.setFillColor(DANGER.r, DANGER.g, DANGER.b)
    doc.roundedRect(MARGIN_LEFT, y - 4, CONTENT_WIDTH, 9, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('BANDERAS DE SEGURIDAD', MARGIN_LEFT + 4, y + 2)
    y += 12
    setColor(DANGER)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    for (const flag of extraction.safetyFlags) {
      checkPageBreak(LINE_HEIGHT)
      doc.text(`!  ${flag}`, MARGIN_LEFT + 4, y)
      y += LINE_HEIGHT
    }
    y += 4
  }

  // ── Raw sections (deduplicated) ──
  const seenFields = new Set<string>()
  const sectionsWithUniqueData = sections.map(section => {
    const uniqueEntries = Object.entries(section.data)
      .filter(([key, v]) => {
        if (v === null || v === '' || v === undefined) return false
        if (ACCUMULATED_FIELDS.has(key)) return false
        if (v === false) return false
        const fieldKey = `${key}:${JSON.stringify(v)}`
        if (seenFields.has(fieldKey)) return false
        seenFields.add(fieldKey)
        return true
      })
    return { ...section, uniqueEntries }
  }).filter(s => s.uniqueEntries.length > 0)

  if (sectionsWithUniqueData.length > 0) {
    checkPageBreak(15)
    setColor(DARK)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Respuestas del paciente', MARGIN_LEFT, y)
    y += LINE_HEIGHT + 4

    for (const section of sectionsWithUniqueData) {
      const label = SECTION_NAMES[section.section] ?? section.section
      checkPageBreak(15)

      // Section label — light bg
      doc.setFillColor(BG_LIGHT.r, BG_LIGHT.g, BG_LIGHT.b)
      doc.roundedRect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, 7, 1.5, 1.5, 'F')
      setColor(DARK)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text(label, MARGIN_LEFT + 3, y + 1)
      y += 8

      doc.setFont('helvetica', 'normal')
      setColor(MID)
      doc.setFontSize(8)
      for (const [key, value] of section.uniqueEntries) {
        const fieldLabel = FIELD_LABELS[key] ?? key.replace(/_/g, ' ')
        let displayValue: string
        if (Array.isArray(value)) {
          const items = value.filter(v => v !== 'ninguno' && v !== 'ninguna')
          if (items.length === 0) continue
          displayValue = items.join(', ')
        } else if (typeof value === 'boolean') {
          displayValue = value ? 'Si' : 'No'
        } else {
          displayValue = String(value)
        }
        const text = `${fieldLabel}: ${displayValue}`
        const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH - 10)
        for (const w of wrapped) {
          checkPageBreak(5)
          doc.text(w, MARGIN_LEFT + 6, y)
          y += 5
        }
      }
      y += 4
    }
  }

  // ── Footer — editorial minimal ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)

    // Thin line
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.3)
    doc.line(MARGIN_LEFT, 278, PAGE_WIDTH - MARGIN_RIGHT, 278)

    // Left: legal
    setColor(LIGHT)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.text('Documento confidencial  —  Ley 26.529 de Derechos del Paciente', MARGIN_LEFT, 283)
    doc.text('AutaMedica IA  —  En fase de validacion clinica ampliada', MARGIN_LEFT, 287)

    // Right: page number
    setColor(LIGHT)
    doc.setFontSize(7)
    doc.text(`${i} / ${pageCount}`, PAGE_WIDTH - MARGIN_RIGHT, 283, { align: 'right' })
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
