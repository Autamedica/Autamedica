import type { MedicalRecord, MedicalRecordType } from '@/lib/patients/lib/repos/medical-history.adapter'

export interface IMedicalHistoryRepository {
  listByType(patientId: string, type: MedicalRecordType): Promise<MedicalRecord[]>
  findById(patientId: string, recordId: string): Promise<MedicalRecord | null>
  listConsultations(patientId: string, limit?: number): Promise<MedicalRecord[]>
  listAll(patientId: string, limit?: number): Promise<MedicalRecord[]>
  insert(
    patientId: string,
    type: MedicalRecordType,
    title: string,
    content: Record<string, unknown>,
  ): Promise<MedicalRecord>
}
