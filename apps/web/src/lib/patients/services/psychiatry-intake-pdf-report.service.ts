import { jsPDF } from 'jspdf'
import { psychiatryPhaseMeta } from '@/lib/patients/data/psychiatry-intake-steps'

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
  if (!value) return 'Sin fecha'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function renderValue(value: unknown): string {
  if (value == null || value === '') return 'Sin dato'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.length > 0 ? value.map(renderValue).join(', ') : 'Sin dato'
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .map(([key, innerValue]) => `${key}: ${renderValue(innerValue)}`)
    .join(' | ')
  return String(value)
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

  doc.setFillColor(122, 61, 84)
  doc.rect(0, 0, pageWidth, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('AutaMedica', margin, 14)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Evaluacion psiquiatrica TDAH y tratamiento con estimulantes', margin, 22)
  doc.setFontSize(8)
  doc.text(`Documento generado: ${formatDate(new Date().toISOString())}`, margin, 29)

  y = 44
  doc.setTextColor(40, 40, 40)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('PACIENTE', margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Nombre: ${input.patient.name}`, margin, y)
  if (input.patient.age != null) {
    doc.text(`Edad: ${input.patient.age} anos`, margin + 90, y)
  }
  y += 5
  if (input.patient.gender) {
    doc.text(`Genero: ${input.patient.gender}`, margin, y)
  }
  doc.text(`Completado: ${formatDate(input.intake.completedAt ?? input.intake.updatedAt)}`, margin + 90, y)
  y += 9

  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('ALCANCE', margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const scopeLines = doc.splitTextToSize(
    'Documento interno de evaluacion psiquiatrica orientado a TDAH y uso potencial de metilfenidato, lisdexanfetamina o Vyvanse. No reemplaza una prescripcion valida.',
    contentWidth,
  )
  for (const line of scopeLines) {
    checkPageBreak(5)
    doc.text(line, margin, y)
    y += 5
  }
  y += 3

  // --- PROTOCOLO DE REDUCCIÓN DE DAÑOS (HARM REDUCTION) ---
  const hasHighDosageOrRisk = input.sections.some(s => 
    Object.entries(s.data).some(([key, val]) => {
      const lowerKey = key.toLowerCase()
      const lowerVal = String(val).toLowerCase()
      
      const isHighDoseText = lowerKey.includes('dosis') && 
        (lowerVal.includes('pastilla') || lowerVal.includes('comprimido') || lowerVal.includes('20') || lowerVal.includes('abuso'))
         
      const isUnknownPrescriber = lowerKey.includes('prescriptor') && 
        (lowerVal.includes('no recuerdo') || lowerVal.includes('no se') || lowerVal.includes('ningun') || lowerVal.includes('no me acuerdo'))
        
      return isHighDoseText || isUnknownPrescriber
    })
  )

  if (hasHighDosageOrRisk) {
    checkPageBreak(25)
    doc.setFillColor(254, 242, 242) // bg-red-50
    doc.rect(margin, y, contentWidth, 22, 'F')
    doc.setDrawColor(248, 113, 113) // border-red-400
    doc.setLineWidth(0.4)
    doc.rect(margin, y, contentWidth, 22, 'S')
    
    doc.setTextColor(220, 38, 38) // text-red-600
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('ALERTA DE CONTENCIÓN CÍNICA (HARM REDUCTION)', margin + 3, y + 6)
    
    doc.setTextColor(100, 10, 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const alertLines = doc.splitTextToSize(
      'AutaMedica promueve la Terapia de Reducción de Daños. Ante sospecha de consumo elevado o pérdida de seguimiento, NO sugerimos el corte abrupto del fármaco. Se aconseja prescribir continuidad escalonada (Tapering) o rotar a Lisdexanfetamina para estabilizar al paciente sin causar abstinencia aguda.',
      contentWidth - 6
    )
    let alertY = y + 11
    for (const line of alertLines) {
      doc.text(line, margin + 3, alertY)
      alertY += 4
    }
    y += 26
  }

  // --- SECCIONES CLÍNICAS ---


  for (const section of input.sections) {
    checkPageBreak(16)
    doc.setFillColor(248, 236, 241)
    doc.rect(margin, y - 4, contentWidth, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    const phaseTitle = psychiatryPhaseMeta[section.phase as keyof typeof psychiatryPhaseMeta]?.title ?? section.phase
    doc.text(`${phaseTitle} - ${section.section.replace(/_/g, ' ')}`, margin + 2, y + 1)
    y += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    const processedKeys = new Set<string>()
    // Prioritize keys with spaces/underscores (usually human-readable labels) over camelCase keys
    const sortedEntries = Object.entries(section.data as Record<string, unknown>).sort((a, b) => {
      const aHasSpace = a[0].includes(' ') || a[0].includes('_')
      const bHasSpace = b[0].includes(' ') || b[0].includes('_')
      return aHasSpace === bHasSpace ? 0 : aHasSpace ? -1 : 1
    })

    for (const [key, value] of sortedEntries) {
      // Deduplicate keys that mean the same thing (e.g. motivoConsulta vs motivo_consulta)
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (processedKeys.has(normalizedKey)) continue
      processedKeys.add(normalizedKey)

      // Convert camelCase or snake_case to separated words, then capitalize first letter
      const label = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()
      const finalLabel = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()

      const lines = doc.splitTextToSize(`${finalLabel}: ${renderValue(value)}`, contentWidth)
      for (const line of lines) {
        checkPageBreak(5)
        doc.text(line, margin, y)
        y += 5
      }
    }
    y += 3
  }

  const pdfOutput = doc.output('arraybuffer')
  const dateSlug = (input.intake.completedAt ?? new Date().toISOString()).slice(0, 10).replace(/-/g, '')
  return {
    buffer: new Uint8Array(pdfOutput),
    filename: `evaluacion-psiquiatrica-tdah-${dateSlug}.pdf`,
  }
}
