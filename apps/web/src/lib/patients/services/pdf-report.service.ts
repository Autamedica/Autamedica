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

const PAGE_WIDTH = 210
const MARGIN_LEFT = 20
const MARGIN_RIGHT = 20
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const LINE_HEIGHT = 6

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
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
      doc.text(`• ${dx}`, MARGIN_LEFT + 4, y)
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
      doc.text(`• ${rec}`, MARGIN_LEFT + 4, y)
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
