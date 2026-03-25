/**
 * Frontend Service: medical history data transformation.
 * Maps raw API responses to typed UI structures (MedicalHistorySummary, MedicalHistoryTimeline).
 * Pure functions — no React state, no fetch.
 */
import type {
  MedicalHistorySummary,
  MedicalHistoryTimeline,
} from '@/lib/patients/types/medical-history'
import type { PatientId } from '@autamedica/types'

interface RawMedicalRecord {
  id: unknown
  type: unknown
  title: unknown
  content: unknown
  created_at: unknown
}

function getContent(record: RawMedicalRecord): Record<string, unknown> {
  const c = record.content
  return c && typeof c === 'object' && !Array.isArray(c) ? (c as Record<string, unknown>) : {}
}

function getType(record: RawMedicalRecord): string {
  return typeof record.type === 'string' ? record.type : ''
}

function isActiveMedication(record: RawMedicalRecord): boolean {
  if (getType(record) !== 'prescription') return false
  const content = getContent(record)
  const status = typeof content.status === 'string' ? content.status : null
  if (status === 'active' || status === 'activa') return true
  if (['completed', 'completada', 'cancelled', 'cancelada'].includes(status ?? '')) return false
  const endDate = typeof content.end_date === 'string' ? content.end_date : null
  return !endDate || new Date(endDate) >= new Date()
}

export function buildMedicalHistorySummary(
  patientId: PatientId,
  records: RawMedicalRecord[],
): MedicalHistorySummary {
  const activeMedications = records.filter(isActiveMedication)
  const recentDiagnoses = records.filter((r) => getType(r) === 'diagnosis')

  return {
    patient_id: patientId,
    active_conditions_count: recentDiagnoses.length,
    active_medications_count: activeMedications.length,
    known_allergies_count: 0,
    last_encounter_date:
      typeof records[0]?.created_at === 'string'
        ? (records[0].created_at as string)
        : new Date().toISOString(),
    chronic_conditions: recentDiagnoses.map((r) => String(r.title || 'Diagnóstico')),
    critical_allergies: [],
    current_medications: activeMedications.map((r) => {
      const content = getContent(r)
      const name =
        typeof content.medication_name === 'string' ? content.medication_name : String(r.title || 'Medicamento')
      const dosage = typeof content.dosage === 'string' ? content.dosage : ''
      return `${name} ${dosage}`.trim()
    }),
  }
}

export function buildMedicalHistoryTimeline(
  patientId: PatientId,
  records: RawMedicalRecord[],
): MedicalHistoryTimeline {
  const activeMedications = records.filter(isActiveMedication)
  const recentDiagnoses = records.filter((r) => getType(r) === 'diagnosis')

  return {
    patient_id: patientId,
    sections: {
      conditions: recentDiagnoses.map((r) => {
        const content = getContent(r)
        return {
          id: String(r.id),
          name: String(r.title || 'Diagnóstico'),
          onset_date:
            typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
          created_at:
            typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
          status: 'active' as const,
          severity: 'moderate' as const,
          notes: typeof content.notes === 'string' ? content.notes : undefined,
        }
      }),
      allergies: [],
      medications: activeMedications.map((r) => {
        const content = getContent(r)
        return {
          id: String(r.id),
          name:
            typeof content.medication_name === 'string'
              ? content.medication_name
              : String(r.title || 'Medicamento'),
          start_date:
            typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
          dosage: typeof content.dosage === 'string' ? content.dosage : 'No especificado',
          frequency:
            typeof content.frequency === 'string' ? content.frequency : 'Según indicación médica',
          status: 'active' as const,
        }
      }),
      procedures: records
        .filter((r) => getType(r) === 'procedure')
        .map((r) => {
          const content = getContent(r)
          return {
            id: String(r.id),
            name: String(r.title || 'Procedimiento'),
            performed_date:
              typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
            indication: typeof content.notes === 'string' ? content.notes : undefined,
            outcome: typeof content.outcome === 'string' ? content.outcome : undefined,
          }
        }),
      encounters: records
        .filter((r) => ['encounter', 'note', 'consultation'].includes(getType(r)))
        .map((r) => {
          const content = getContent(r)
          return {
            id: String(r.id),
            created_at:
              typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
            reason: String(r.title || 'Consulta'),
            location: typeof content.facility === 'string' ? content.facility : undefined,
          }
        }),
      immunizations: [],
    },
  }
}
