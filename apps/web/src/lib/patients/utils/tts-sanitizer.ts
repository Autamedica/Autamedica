/**
 * Sanitizes text for browser SpeechSynthesis (TTS).
 * Expands medical abbreviations, removes characters that TTS
 * would read literally (quotes, dashes), and normalizes units.
 */

const MEDICAL_ABBREVIATIONS: Record<string, string> = {
  'HUM': 'Hospital Universitario de Maternidad',
  'TA': 'tensión arterial',
  'FC': 'frecuencia cardíaca',
  'FR': 'frecuencia respiratoria',
  'IMC': 'índice de masa corporal',
  'ECG': 'electrocardiograma',
  'EKG': 'electrocardiograma',
  'PA': 'presión arterial',
  'Sat': 'saturación',
  'SatO2': 'saturación de oxígeno',
  'SpO2': 'saturación de oxígeno',
  'HTA': 'hipertensión arterial',
  'DBT': 'diabetes',
  'DM': 'diabetes mellitus',
  'IR': 'insuficiencia renal',
  'IC': 'insuficiencia cardíaca',
  'IAM': 'infarto agudo de miocardio',
  'ACV': 'accidente cerebrovascular',
  'EPOC': 'enfermedad pulmonar obstructiva crónica',
  'RX': 'radiografía',
  'TAC': 'tomografía',
  'RM': 'resonancia magnética',
  'VIH': 'virus de inmunodeficiencia humana',
  'ETS': 'enfermedad de transmisión sexual',
  'ITS': 'infección de transmisión sexual',
  'AINE': 'antiinflamatorio',
  'AINEs': 'antiinflamatorios',
  'IBP': 'inhibidor de bomba de protones',
  'ATB': 'antibiótico',
}

const UNIT_EXPANSIONS: [RegExp, string][] = [
  [/(\d+)\s*°C/g, '$1 grados'],
  [/(\d+)\s*°F/g, '$1 grados fahrenheit'],
  [/(\d+)\s*mg\/dl/gi, '$1 miligramos por decilitro'],
  [/(\d+)\s*mg\/kg/gi, '$1 miligramos por kilo'],
  [/(\d+)\s*mg/g, '$1 miligramos'],
  [/(\d+)\s*ml/g, '$1 mililitros'],
  [/(\d+)\s*mmHg/g, '$1 milímetros de mercurio'],
  [/(\d+)\s*bpm/gi, '$1 latidos por minuto'],
  [/(\d+)\s*rpm/gi, '$1 respiraciones por minuto'],
  [/(\d+)\s*kg/g, '$1 kilos'],
  [/(\d+)\s*cm/g, '$1 centímetros'],
  [/(\d+)\s*%/g, '$1 por ciento'],
]

export function sanitizeForTTS(text: string): string {
  let result = text

  // Expand medical abbreviations (word-boundary matching)
  for (const [abbr, expansion] of Object.entries(MEDICAL_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'g')
    result = result.replace(regex, expansion)
  }

  // Expand units
  for (const [pattern, replacement] of UNIT_EXPANSIONS) {
    result = result.replace(pattern, replacement)
  }

  // Remove characters that TTS reads literally
  result = result
    .replace(/['"''""`]/g, '')          // quotes, apostrophes
    .replace(/[—–]/g, ', ')             // em/en dashes → pause
    .replace(/\[ANAMNESIS_COMPLETA\]/g, '') // strip completion tag
    .replace(/\{[^}]*\}/g, '')          // strip JSON blocks
    .replace(/\s{2,}/g, ' ')           // collapse whitespace
    .trim()

  return result
}

function splitLongSegment(segment: string, maxLength: number): string[] {
  if (segment.length <= maxLength) return [segment]

  const commaParts = segment
    .split(/,(?=\s)/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (commaParts.length > 1) {
    const output: string[] = []
    let current = ''

    for (const part of commaParts) {
      const candidate = current ? `${current}, ${part}` : part
      if (candidate.length <= maxLength) {
        current = candidate
      } else {
        if (current) output.push(current)
        current = part
      }
    }

    if (current) output.push(current)
    return output.flatMap((part) => splitLongSegment(part, maxLength))
  }

  const words = segment.split(/\s+/).filter(Boolean)
  const output: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxLength) {
      current = candidate
      continue
    }

    if (current) output.push(current)
    current = word
  }

  if (current) output.push(current)
  return output
}

export function segmentForTTS(text: string, maxLength = 140): string[] {
  const sanitized = sanitizeForTTS(text)
  if (!sanitized) return []

  const sentenceLikeParts = sanitized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (sentenceLikeParts.length === 0) {
    return splitLongSegment(sanitized, maxLength)
  }

  const segments: string[] = []
  let current = ''

  for (const part of sentenceLikeParts) {
    const candidate = current ? `${current} ${part}` : part
    if (candidate.length <= maxLength) {
      current = candidate
      continue
    }

    if (current) segments.push(current)
    current = ''

    if (part.length <= maxLength) {
      current = part
      continue
    }

    segments.push(...splitLongSegment(part, maxLength))
  }

  if (current) segments.push(current)
  return segments.filter(Boolean)
}
