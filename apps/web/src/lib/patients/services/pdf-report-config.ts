/**
 * Constants and configuration for PDF report generation.
 * Extracted from pdf-report.service.ts to reduce file size.
 */

export const PAGE_WIDTH = 210
export const MARGIN_LEFT = 20
export const MARGIN_RIGHT = 20
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
export const LINE_HEIGHT = 6

export const SECTION_NAMES: Record<string, string> = {
  motivo_consulta: 'Motivo de consulta',
  enfermedad_actual: 'Enfermedad actual',
  antecedentes_personales: 'Antecedentes personales',
  antecedentes_familiares: 'Antecedentes familiares',
  revision_sistemas: 'Revisión por sistemas',
  habitos: 'Hábitos',
  medicamentos: 'Medicamentos',
  alergias: 'Alergias',
  cardiovascular: 'Sistema cardiovascular',
  respiratory: 'Sistema respiratorio',
  respiratorio: 'Sistema respiratorio',
  digestive: 'Sistema digestivo',
  digestivo: 'Sistema digestivo',
  genitourinary: 'Sistema genitourinario',
  genitourinario: 'Sistema genitourinario',
  musculoesqueletico: 'Sistema musculoesquelético',
}

/** Fields that are shared/accumulated across sections — exclude from raw display */
export const ACCUMULATED_FIELDS = new Set([
  'edad', 'fecha_nacimiento', 'ocupacion_actual', 'años_ocupacion',
  'sintoma_principal', 'cuando_empezo', 'intensidad_sintoma',
  'toma_medicamentos', 'tiene_alergias', 'enfermedades_cronicas',
  'fuma', 'alcohol', 'ejercicio', 'dieta', 'horas_sueno',
  'madre_viva', 'padre_vivo',
])

/** Human-readable labels for raw field keys */
export const FIELD_LABELS: Record<string, string> = {
  dolor_pecho: 'Dolor de pecho',
  falta_aire: 'Falta de aire',
  palpitaciones: 'Palpitaciones',
  hinchazon_piernas: 'Hinchazón de piernas',
  tos: 'Tos',
  silbido_pecho: 'Silbido en el pecho',
  falta_aire_respiratorio: 'Disnea de esfuerzo',
  acidez: 'Acidez/reflujo',
  dolor_abdominal: 'Dolor abdominal',
  cambio_habito_intestinal: 'Cambio en hábito intestinal',
  sintomas_digestivos: 'Síntomas digestivos',
  dolor_orinar: 'Dolor al orinar',
  frecuencia_urinaria: 'Frecuencia urinaria',
  lista_medicamentos: 'Medicamentos actuales',
  exposicion_riesgos: 'Exposición a riesgos',
  confirma_informacion: 'Información confirmada',
  resumen_final: 'Resumen final',
  enfermedades_previas: 'Enfermedades previas',
  edad: 'Edad',
  ocupacion: 'Ocupación',
}

export function formatDate(iso: string | null): string {
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
