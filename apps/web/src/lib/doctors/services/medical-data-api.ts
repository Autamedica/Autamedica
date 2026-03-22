/**
 * Servicio para obtener datos médicos
 * Usa Supabase en producción, mocks en desarrollo (controlado por feature flags)
 */

import type {
  AIAnalysis,
  MedicalRecord,
  MedicalRecordFilters,
  Prescription,
  PrescriptionFilters,
  PrescriptionStatus,
  UUID,
  VitalSigns
} from '@/types/medical';
import { getOptionalClientEnv, featureFlags, logger } from '@autamedica/shared';
import type { Database } from '@autamedica/types';
import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase (solo se inicializa si NO usamos mocks)
const supabase = !featureFlags.USE_MOCK_MEDICAL_DATA
  ? (() => {
    const url = getOptionalClientEnv('PUBLIC_SUPABASE_URL');
    const anonKey = getOptionalClientEnv('PUBLIC_SUPABASE_ANON_KEY');

    // Solo inicializa si los valores existen (en el servidor/build podrían faltar sin PUBLIC_)
    if (url && anonKey) {
      return createClient<Database>(url, anonKey);
    }
    return null;
  })()
  : null;

interface PrescriptionRecordContent {
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
}

function normalizePrescriptionRecord(row: Database['public']['Tables']['medical_records']['Row']): Prescription {
  const content = (row.content && typeof row.content === 'object' && !Array.isArray(row.content)
    ? row.content
    : {}) as PrescriptionRecordContent
  const primaryMedication = content.medications?.[0]
  const prescribedDate = content.prescribed_date || content.start_date || row.date_recorded || row.created_at || new Date().toISOString()
  const startDate = content.start_date || prescribedDate
  const status = content.status
    && ['activa', 'completada', 'cancelada', 'pausada'].includes(content.status)
    ? content.status
    : content.end_date && new Date(content.end_date) < new Date()
      ? 'completada'
      : 'activa'

  return {
    id: row.id as UUID,
    patient_id: (row.patient_id ?? '') as UUID,
    doctor_id: (row.doctor_id ?? '') as UUID,
    medical_record_id: row.id as UUID,
    medication_name: content.medication_name || primaryMedication?.name || row.title.replace(/^Prescripci[oó]n:\s*/i, '') || 'Prescripción médica',
    dosage: content.dosage || primaryMedication?.dosage || '',
    frequency: content.frequency || primaryMedication?.frequency || '',
    duration: content.duration || primaryMedication?.duration || '',
    instructions: content.instructions || primaryMedication?.instructions || '',
    status,
    prescribed_date: prescribedDate,
    start_date: startDate,
    end_date: content.end_date ?? null,
    notes: content.notes ?? null,
    side_effects_warning: content.side_effects_warning ?? null,
    created_at: row.created_at || prescribedDate,
    updated_at: row.updated_at || row.created_at || prescribedDate,
  }
}

// API Client
class MedicalDataAPI {
  private supabase = supabase

  constructor() {
    if (featureFlags.USE_MOCK_MEDICAL_DATA) {
      logger.info('MedicalDataAPI en modo MOCK (desarrollo)')
    } else {
      logger.info('MedicalDataAPI usando Supabase (produccion)')
    }
  }

  // Signos vitales
  async getVitalSigns(patientId: UUID): Promise<VitalSigns[]> {
    // Modo mock para desarrollo
    if (featureFlags.USE_MOCK_MEDICAL_DATA || !this.supabase) {
      return this.getMockVitalSigns(patientId)
    }

    // Modo producción con Supabase
    try {
      const { data, error } = await this.supabase
        .from('vital_signs')
        .select('*')
        .eq('patient_id', patientId)
        .order('recorded_at', { ascending: false })
        .limit(20)

      if (error) throw error
      return (data ?? []) as unknown as VitalSigns[]
    } catch (error) {
      logger.error('Error fetching vital signs:', error)
      // Fallback a mock en caso de error
      return this.getMockVitalSigns(patientId)
    }
  }

  private getMockVitalSigns(_patientId: UUID): Promise<VitalSigns[]> {
    return Promise.resolve([])
  }

  // Historial médico
  async getMedicalRecords(
    patientId: UUID,
    filters: MedicalRecordFilters = {},
    page = 0,
    pageSize = 10
  ): Promise<{ records: MedicalRecord[]; hasMore: boolean }> {
    // Modo mock
    if (featureFlags.USE_MOCK_MEDICAL_DATA || !this.supabase) {
      return this.getMockMedicalRecords(patientId, filters, page, pageSize)
    }

    // Modo producción con Supabase
    try {
      let query = this.supabase
        .from('medical_records')
        .select('*', { count: 'exact' })
        .eq('patient_id', patientId)

      // Aplicar filtros - DB columns: type (not consultation_type), content (JSON, not diagnosis)
      if (filters.consultation_type) {
        query = query.eq('type', filters.consultation_type)
      }
      // diagnosis_contains is not directly searchable as a column;
      // content is a JSON field - skip server-side filter for this

      // Paginación - DB column: date_recorded (not consultation_date)
      const startIndex = page * pageSize
      query = query
        .order('date_recorded', { ascending: false })
        .range(startIndex, startIndex + pageSize - 1)

      const { data, error, count } = await query

      if (error) throw error

      return {
        records: (data ?? []) as unknown as MedicalRecord[],
        hasMore: count ? startIndex + pageSize < count : false,
      }
    } catch (error) {
      logger.error('Error fetching medical records:', error)
      return this.getMockMedicalRecords(patientId, filters, page, pageSize)
    }
  }

  private getMockMedicalRecords(
    _patientId: UUID,
    _filters: MedicalRecordFilters = {},
    _page = 0,
    _pageSize = 10
  ): Promise<{ records: MedicalRecord[]; hasMore: boolean }> {
    return Promise.resolve({ records: [], hasMore: false })
  }

  // Prescripciones
  async getPrescriptions(
    patientId: UUID,
    filters: PrescriptionFilters = {}
  ): Promise<Prescription[]> {
    if (featureFlags.USE_MOCK_MEDICAL_DATA || !this.supabase) {
      return []
    }

    try {
      const { data, error } = await this.supabase
        .from('medical_records')
        .select('*')
        .eq('patient_id', patientId)
        .eq('type', 'prescription')
        .is('deleted_at', null)
        .order('date_recorded', { ascending: false })

      if (error) throw error

      let prescriptions = (data || []).map(normalizePrescriptionRecord)

      if (filters.status) {
        prescriptions = prescriptions.filter((prescription) => prescription.status === filters.status)
      }

      if (filters.medication_name) {
        const searchTerm = filters.medication_name.toLowerCase()
        prescriptions = prescriptions.filter((prescription) =>
          prescription.medication_name.toLowerCase().includes(searchTerm)
        )
      }

      if (filters.active_only) {
        const now = new Date()
        prescriptions = prescriptions.filter((prescription) =>
          prescription.status === 'activa' &&
          new Date(prescription.start_date) <= now &&
          (!prescription.end_date || new Date(prescription.end_date) >= now)
        )
      }

      return prescriptions
    } catch (error) {
      logger.error('Error fetching prescriptions:', error)
      return []
    }
  }

  // Análisis de IA
  async getAIAnalyses(_patientId: UUID): Promise<AIAnalysis[]> {
    return []
  }
}

// Instancia singleton del API
export const medicalDataAPI = new MedicalDataAPI()

// Funciones individuales para compatibilidad
export const fetchVitalSigns = (patientId: UUID) => medicalDataAPI.getVitalSigns(patientId)
export const fetchMedicalRecords = (patientId: UUID, filters?: MedicalRecordFilters, page?: number, pageSize?: number) =>
  medicalDataAPI.getMedicalRecords(patientId, filters, page, pageSize)
export const fetchPrescriptions = (patientId: UUID, filters?: PrescriptionFilters) =>
  medicalDataAPI.getPrescriptions(patientId, filters)
export const fetchAIAnalyses = (patientId: UUID) => medicalDataAPI.getAIAnalyses(patientId)
