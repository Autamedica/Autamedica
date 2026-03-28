import type {
  DashboardAppointmentSummary,
  DashboardMedicationSummary,
  DashboardResultSummary,
  DashboardScreeningSummary,
} from '@/lib/patients/types/dashboard-summary'
import type {
  PatientSnapshotVitals,
} from '@/lib/patients/types/patient-snapshot'
import type { Database, Json } from '@autamedica/types'

type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & {
  doctor: {
    first_name: string | null
    last_name: string | null
    specialty: string | null
  } | null
}
type LabResultRow = Database['public']['Tables']['lab_results']['Row']
type MedicalRecordRow = Database['public']['Tables']['medical_records']['Row']
type PatientScreeningRow = Database['public']['Tables']['patient_screenings']['Row'] & {
  screening: Pick<
    Database['public']['Tables']['preventive_screenings']['Row'],
    'id' | 'name' | 'category'
  > | null
}
type RecommendedScreeningRow =
  Database['public']['Functions']['get_recommended_screenings']['Returns'][number]
type VitalSignRow = Database['public']['Tables']['vital_signs']['Row']

export type {
  AppointmentRow,
  LabResultRow,
  MedicalRecordRow,
  PatientScreeningRow,
  RecommendedScreeningRow,
  VitalSignRow,
}

export function toObject(value: Json | null): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
}

export function toStringArray(value: Json | null): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (typeof item === 'string') {
      return item
    }

    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>
      const label =
        typeof record.name === 'string'
          ? record.name
          : typeof record.allergen === 'string'
            ? record.allergen
            : null

      return label ? [label] : []
    }

    return []
  })
}

export function isPrescriptionActive(record: MedicalRecordRow): boolean {
  const content = toObject(record.content as Json | null)
  const status = typeof content.status === 'string' ? content.status.toLowerCase() : null

  if (status === 'active' || status === 'activa') {
    return true
  }

  if (
    status === 'completed' ||
    status === 'completada' ||
    status === 'cancelled' ||
    status === 'cancelada'
  ) {
    return false
  }

  const endDate = typeof content.end_date === 'string' ? content.end_date : null
  return !endDate || new Date(endDate).getTime() >= Date.now()
}

export function formatDoctorName(doctor: AppointmentRow['doctor']): string | null {
  if (!doctor) {
    return null
  }

  const fullName = [doctor.first_name, doctor.last_name].filter(Boolean).join(' ').trim()
  return fullName || null
}

export function normalizeAppointment(row: AppointmentRow): DashboardAppointmentSummary {
  const startDate = new Date(row.start_time)
  const now = new Date()

  return {
    id: row.id,
    startTime: row.start_time,
    status: row.status,
    type: row.type,
    meetingUrl: row.meeting_url,
    location: row.location,
    doctorName: formatDoctorName(row.doctor),
    doctorSpecialty: row.doctor?.specialty ?? null,
    isToday: startDate.toDateString() === now.toDateString(),
  }
}

export function normalizeMedication(record: MedicalRecordRow): DashboardMedicationSummary {
  const content = toObject(record.content as Json | null)
  const name = typeof content.medication_name === 'string' ? content.medication_name : record.title

  return {
    id: record.id,
    name,
    dosage: typeof content.dosage === 'string' ? content.dosage : 'No especificado',
    frequency:
      typeof content.frequency === 'string' ? content.frequency : 'Segun indicacion medica',
    status: typeof content.status === 'string' ? content.status : 'active',
    startDate: record.created_at,
    notes: typeof content.notes === 'string' ? content.notes : null,
  }
}

export function normalizeScreeningStatus(status: string): DashboardScreeningSummary['status'] {
  if (status === 'completed') {
    return 'up_to_date'
  }

  if (status === 'overdue') {
    return 'overdue'
  }

  return 'due_soon'
}

export function screeningStatusPriority(
  status: DashboardScreeningSummary['status'],
): DashboardScreeningSummary['priority'] {
  if (status === 'overdue') {
    return 'high'
  }

  if (status === 'due_soon') {
    return 'medium'
  }

  return 'low'
}

export function normalizeScreening(item: PatientScreeningRow): DashboardScreeningSummary {
  const status = normalizeScreeningStatus(item.status)

  return {
    id: item.screening_id,
    title: item.screening?.name ?? 'Screening preventivo',
    status,
    priority: screeningStatusPriority(status),
    category: item.screening?.category ?? 'general',
    nextDueDate: item.next_due_date ?? item.scheduled_date,
  }
}

export function normalizeRecommendedScreening(item: RecommendedScreeningRow): DashboardScreeningSummary {
  const status = normalizeScreeningStatus(item.status)
  const priority =
    item.urgency === 'high' ? 'high' : item.urgency === 'medium' ? 'medium' : 'low'

  return {
    id: item.screening_id,
    title: item.screening_name,
    status,
    priority,
    category: item.category,
    nextDueDate: item.next_due_date,
  }
}

export function normalizeResult(row: LabResultRow): DashboardResultSummary {
  return {
    id: row.id,
    testType: row.test_type,
    testDate: row.test_date,
    status: row.status,
    laboratoryName: row.laboratory_name,
    notes: row.notes,
    reviewedAt: row.reviewed_at,
  }
}

export function normalizeVitals(row: VitalSignRow | null): PatientSnapshotVitals | null {
  if (!row) {
    return null
  }

  return {
    measuredAt: row.measured_at,
    bloodPressure:
      row.blood_pressure_systolic && row.blood_pressure_diastolic
        ? `${row.blood_pressure_systolic}/${row.blood_pressure_diastolic}`
        : null,
    systolic: row.blood_pressure_systolic ?? null,
    diastolic: row.blood_pressure_diastolic ?? null,
    heartRate: row.heart_rate ?? null,
    temperature: row.temperature ?? null,
    oxygenSaturation: row.oxygen_saturation ?? null,
    weight: row.weight ?? null,
  }
}
