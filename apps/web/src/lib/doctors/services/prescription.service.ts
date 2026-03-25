/**
 * Service: Prescription business logic.
 * Pure functions + orchestration of repository. No React state, no fetch.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { logger } from '@autamedica/shared'
import { medicalRecordsRepo } from '@/lib/doctors/lib/repos/medical-records'
import type { UiMedicalRecord, MedicalRecordInsert, MedicalRecordUpdate } from '@/lib/doctors/lib/repos/medical-records'
import type {
  Prescription,
  PrescriptionFilters,
  PrescriptionStatus,
  UUID,
} from '@/types/medical'

// ─── Internal Types ───

interface PrescriptionContent {
  medication_name?: string
  dosage?: string
  frequency?: string
  duration?: string
  instructions?: string
  status?: PrescriptionStatus
  prescribed_date?: string
  start_date?: string
  end_date?: string | null
  notes?: string | null
  side_effects_warning?: string | null
  medications?: Array<{
    name?: string
    dosage?: string
    frequency?: string
    duration?: string
    instructions?: string
  }>
  [key: string]: unknown
}

// ─── Pure Business Logic ───

function getPrescriptionContent(content: unknown): PrescriptionContent {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content as PrescriptionContent
  }
  return {}
}

function deriveStatus(content: PrescriptionContent, fallbackDate: string): PrescriptionStatus {
  if (content.status && (['activa', 'completada', 'cancelada', 'pausada'] as PrescriptionStatus[]).includes(content.status)) {
    return content.status
  }

  if (content.end_date) {
    return new Date(content.end_date) < new Date() ? 'completada' : 'activa'
  }

  return fallbackDate ? 'activa' : 'pausada'
}

function mapRecordToPrescription(record: UiMedicalRecord): Prescription {
  const content = getPrescriptionContent(record.content)
  const primaryMedication = content.medications?.[0]
  const prescribedDate = content.prescribed_date || content.start_date || record.dateRecorded || record.createdAt || new Date().toISOString()
  const startDate = content.start_date || prescribedDate

  return {
    id: record.id as UUID,
    patient_id: (record.patientId ?? '') as UUID,
    doctor_id: (record.doctorId ?? '') as UUID,
    medical_record_id: record.id as UUID,
    medication_name: content.medication_name || primaryMedication?.name || record.title.replace(/^Prescripci[oó]n:\s*/i, '') || 'Prescripción médica',
    dosage: content.dosage || primaryMedication?.dosage || '',
    frequency: content.frequency || primaryMedication?.frequency || '',
    duration: content.duration || primaryMedication?.duration || '',
    instructions: content.instructions || primaryMedication?.instructions || '',
    status: deriveStatus(content, prescribedDate),
    prescribed_date: prescribedDate,
    start_date: startDate,
    end_date: content.end_date ?? null,
    notes: content.notes ?? null,
    side_effects_warning: content.side_effects_warning ?? null,
    created_at: record.createdAt || prescribedDate,
    updated_at: record.updatedAt || record.createdAt || prescribedDate,
  }
}

function applyFilters(
  prescriptions: Prescription[],
  filters: PrescriptionFilters,
): Prescription[] {
  let filtered = prescriptions

  if (filters.status) {
    filtered = filtered.filter((p) => p.status === filters.status)
  }

  if (filters.medication_name) {
    const search = filters.medication_name.toLowerCase()
    filtered = filtered.filter((p) =>
      p.medication_name.toLowerCase().includes(search),
    )
  }

  if (filters.active_only) {
    const now = new Date()
    filtered = filtered.filter((p) =>
      p.status === 'activa' &&
      new Date(p.start_date) <= now &&
      (!p.end_date || new Date(p.end_date) >= now),
    )
  }

  return filtered
}

// ─── Service (orchestrates repo + business logic) ───

async function resolveCurrentDoctorId(): Promise<string | null> {
  const supabase = getBrowserSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    if (error) logger.warn('[prescriptionService] resolveCurrentDoctorId auth failed', error)
    return null
  }

  return medicalRecordsRepo.resolveDoctorIdByUser(user.id)
}

export const prescriptionService = {
  async getByPatient(
    patientId: string,
    filters: PrescriptionFilters = {},
  ): Promise<Prescription[]> {
    const records = await medicalRecordsRepo.findByPatient(patientId, 'prescription')
    const prescriptions = records.map(mapRecordToPrescription)
    return applyFilters(prescriptions, filters)
  },

  async create(
    patientId: string,
    prescription: Omit<Prescription, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<void> {
    const doctorId = prescription.doctor_id || await resolveCurrentDoctorId()
    const recordedAt = prescription.prescribed_date || prescription.start_date || new Date().toISOString()

    const record: MedicalRecordInsert = {
      patientId,
      doctorId: doctorId,
      type: 'prescription',
      title: prescription.medication_name
        ? `Prescripción: ${prescription.medication_name}`
        : 'Prescripción médica',
      visibility: 'patient',
      dateRecorded: recordedAt,
      content: {
        medication_name: prescription.medication_name,
        dosage: prescription.dosage,
        frequency: prescription.frequency,
        duration: prescription.duration,
        instructions: prescription.instructions,
        status: prescription.status,
        prescribed_date: prescription.prescribed_date,
        start_date: prescription.start_date,
        end_date: prescription.end_date,
        notes: prescription.notes,
        side_effects_warning: prescription.side_effects_warning,
      },
    }

    await medicalRecordsRepo.insert(record)
  },

  async update(
    id: string,
    current: Prescription,
    updates: Partial<Prescription>,
  ): Promise<void> {
    const merged = { ...current, ...updates }
    const doctorId = merged.doctor_id || await resolveCurrentDoctorId()

    const record: MedicalRecordUpdate = {
      doctorId,
      title: merged.medication_name
        ? `Prescripción: ${merged.medication_name}`
        : 'Prescripción médica',
      dateRecorded: merged.prescribed_date || merged.start_date || current.prescribed_date,
      content: {
        medication_name: merged.medication_name,
        dosage: merged.dosage,
        frequency: merged.frequency,
        duration: merged.duration,
        instructions: merged.instructions,
        status: merged.status,
        prescribed_date: merged.prescribed_date,
        start_date: merged.start_date,
        end_date: merged.end_date,
        notes: merged.notes,
        side_effects_warning: merged.side_effects_warning,
      },
    }

    await medicalRecordsRepo.update(id, record)
  },
}
