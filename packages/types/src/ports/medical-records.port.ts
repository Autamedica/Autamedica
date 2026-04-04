/**
 * Port: Medical Records Repository
 *
 * Interfaz abstracta para acceso a registros médicos.
 * La implementación concreta (Supabase adapter) vive en apps/web.
 * Tests pueden usar mock adapters.
 */

export interface MedicalRecordView {
  id: string
  patientId: string | null
  doctorId: string | null
  title: string
  type: string
  content: unknown
  visibility: string | null
  dateRecorded: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface MedicalRecordInsertInput {
  patientId: string
  doctorId: string | null
  type: string
  title: string
  visibility?: string
  dateRecorded?: string
  content: Record<string, unknown>
}

export interface MedicalRecordUpdateInput {
  doctorId?: string | null
  title?: string
  dateRecorded?: string
  content?: Record<string, unknown>
}

export interface IMedicalRecordsRepository {
  findByPatient(patientId: string, type?: string): Promise<MedicalRecordView[]>
  insert(record: MedicalRecordInsertInput): Promise<void>
  update(id: string, updates: MedicalRecordUpdateInput): Promise<void>
  resolveDoctorIdByUser(userId: string): Promise<string | null>
}
