/**
 * Backend Service: Patient business logic.
 * Orchestrates repository access for API Controllers.
 */
import { createPatientRepositoryAdapter, patientsRepo } from '@/lib/doctors/lib/repos/patients'
import { createAlertsRepositoryAdapter } from '@/lib/doctors/lib/repos/alerts'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import type { PatientWithProfile, UUID } from '@autamedica/types'
import { GetRelevantPatientsUseCase } from '../usecases/GetRelevantPatientsUseCase'
import { GetAllRelevantPatientsUseCase } from '../usecases/GetAllRelevantPatientsUseCase'

type RuntimeEnv = Record<string, unknown> | null | undefined

export const patientBackendService = {
  /**
   * Resolve all active patients in the platform using relevance use case.
   * Uses admin client -- auth is validated at the API route level.
   */
  async getActivePatients(runtimeEnv?: RuntimeEnv): Promise<PatientWithProfile[]> {
    try {
      const admin = createAstroAdminClient(runtimeEnv)
      const useCase = new GetAllRelevantPatientsUseCase({
        patientRepo: createPatientRepositoryAdapter(admin),
        alertsRepo: createAlertsRepositoryAdapter(admin),
      })
      return await useCase.execute()
    } catch (error) {
      logger.error('[patientBackendService] getActivePatients failed', error)
      throw error
    }
  },

  /**
   * Resolve patients assigned to a doctor using the relevance use case,
   * merged with doctor-owned external/eventual patients (`patient_private_identities`).
   * Uses admin client -- auth is validated at the API route level.
   */
  async getAssignedPatients(
    doctorUserId: string,
    runtimeEnv?: RuntimeEnv,
  ): Promise<PatientWithProfile[]> {
    try {
      const admin = createAstroAdminClient(runtimeEnv)
      const useCase = new GetRelevantPatientsUseCase({
        patientRepo: createPatientRepositoryAdapter(admin),
        alertsRepo: createAlertsRepositoryAdapter(admin),
      })
      const assigned = await useCase.execute(doctorUserId)

      const { data: doctorRow } = await admin
        .from('doctors')
        .select('id')
        .eq('user_id', doctorUserId)
        .maybeSingle()

      if (!doctorRow?.id) return assigned

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: privateRows } = await (admin as any)
        .from('patient_private_identities')
        .select('patient_id, full_name, document_number, birth_date, gender, phone, email, updated_at, created_at')
        .eq('doctor_id', doctorRow.id)
        .order('updated_at', { ascending: false })
        .limit(100)

      const rows = (privateRows ?? []) as Array<{
        patient_id?: string | null
        full_name?: string | null
        document_number?: string | null
        birth_date?: string | null
        gender?: string | null
        phone?: string | null
        email?: string | null
        updated_at?: string | null
        created_at?: string | null
      }>

      if (rows.length === 0) return assigned

      const byId = new Map<string, PatientWithProfile>()
      for (const p of assigned) {
        byId.set(p.id, p)
      }

      for (const row of rows) {
        const pid = row.patient_id
        if (!pid) continue
        const fullName = (row.full_name ?? '').trim()
        const parts = fullName ? fullName.split(/\s+/) : []
        const firstName = parts[0] ?? null
        const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null

        const existing = byId.get(pid)
        if (existing) {
          const existingRecord = existing as PatientWithProfile & {
            dni?: string | null
            isExternal?: boolean
          }
          const curProfile = (existing.profile ?? {}) as Partial<
            NonNullable<PatientWithProfile['profile']>
          >
          byId.set(pid, {
            ...existing,
            dni: existingRecord.dni ?? row.document_number ?? null,
            birth_date: existing.birth_date ?? row.birth_date ?? null,
            gender: existing.gender ?? row.gender ?? null,
            isExternal: true,
            profile: {
              ...curProfile,
              first_name: curProfile.first_name || firstName,
              last_name: curProfile.last_name || lastName,
              phone: curProfile.phone || row.phone || null,
              email: curProfile.email || row.email || null,
            },
          } as unknown as PatientWithProfile)
        } else {
          byId.set(pid, {
            id: pid,
            user_id: null,
            dni: row.document_number ?? null,
            birth_date: row.birth_date ?? null,
            gender: row.gender ?? null,
            active: true,
            created_at: row.created_at ?? new Date().toISOString(),
            updated_at: row.updated_at ?? new Date().toISOString(),
            isExternal: true,
            profile: {
              user_id: null,
              first_name: firstName,
              last_name: lastName,
              phone: row.phone ?? null,
              email: row.email ?? null,
              avatar_url: null,
              role: 'patient',
            },
          } as unknown as PatientWithProfile)
        }
      }

      return Array.from(byId.values())
    } catch (error) {
      logger.error('[patientBackendService] getAssignedPatients failed', { doctorUserId, error })
      throw error
    }
  },

  async getPatientsByCompany(
    companyId: string,
    runtimeEnv?: RuntimeEnv,
  ): Promise<PatientWithProfile[]> {
    try {
      const admin = createAstroAdminClient(runtimeEnv)
      return await patientsRepo.findByCompany(companyId, admin)
    } catch (error) {
      logger.error('[patientBackendService] getPatientsByCompany failed', { companyId, error })
      throw error
    }
  },

  async getPatientById(
    id: UUID,
    runtimeEnv?: RuntimeEnv,
  ): Promise<PatientWithProfile | null> {
    try {
      const admin = createAstroAdminClient(runtimeEnv)
      const patient = await patientsRepo.findById(id, admin)
      return patient ? { ...patient, ...(patient.profile || {}) } : null
    } catch (error) {
      logger.error('[patientBackendService] getPatientById failed', { id, error })
      throw error
    }
  }
}
