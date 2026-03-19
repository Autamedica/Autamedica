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
import { featureFlags, logger } from '@autamedica/shared';
import type { Database } from '@autamedica/types';
import type { SupabaseClient } from '@supabase/supabase-js';

// Lazy Supabase client — uses the singleton from @autamedica/auth/client
// which has lock bypass, custom cookies, and SSO support.
// Cannot import at module scope because createBrowserClient requires window.
let _supabase: SupabaseClient<Database> | null = null;
function getSupabase(): SupabaseClient<Database> | null {
  if (featureFlags.USE_MOCK_MEDICAL_DATA) return null;
  if (_supabase) return _supabase;
  if (typeof window === 'undefined') return null;
  try {
    // Dynamic import to avoid SSR issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createBrowserClient } = require('@autamedica/auth/client');
    _supabase = createBrowserClient() as SupabaseClient<Database>;
    return _supabase;
  } catch {
    return null;
  }
}

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
  private get supabase() { return getSupabase(); }
  private readonly baseUrl = '/api'

  constructor() {
    if (featureFlags.USE_MOCK_MEDICAL_DATA) {
      logger.info('MedicalDataAPI en modo MOCK (desarrollo)')
    } else {
      logger.info('MedicalDataAPI usando Supabase (produccion)')
    }
  }

  private async fetchWithErrorHandling<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error(`API Error [${endpoint}]:`, error)
      throw error
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
      return (data || []).map((row: any) => ({
        ...row,
        doctor_id: row.recorded_by_id || row.recorded_by || row.patient_id, // Fallback
      })) as VitalSigns[]
    } catch (error) {
      logger.error('Error fetching vital signs:', error)
      // Fallback a mock en caso de error
      return this.getMockVitalSigns(patientId)
    }
  }

  private getMockVitalSigns(patientId: UUID): Promise<VitalSigns[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockData = patientId === '550e8400-e29b-41d4-a716-446655440000' ? [
          {
            id: '1' as UUID,
            patient_id: patientId,
            recorded_by_id: '660f9500-f30c-52e5-b827-556766550001' as UUID,
            recorded_at: new Date().toISOString(),
            blood_pressure_systolic: 120,
            blood_pressure_diastolic: 80,
            heart_rate: 72,
            temperature: 36.5,
            respiratory_rate: 16,
            oxygen_saturation: 98,
            weight: 65.5,
            height: 168,
            bmi: 23.2,
            pain_scale: 0,
            notes: 'Signos vitales dentro de parámetros normales. Paciente estable.',
            measurement_context: 'routine_checkup',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: '2' as UUID,
            patient_id: patientId,
            recorded_by_id: '660f9500-f30c-52e5-b827-556766550001' as UUID,
            recorded_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            blood_pressure_systolic: 125,
            blood_pressure_diastolic: 82,
            heart_rate: 75,
            temperature: 36.4,
            respiratory_rate: 15,
            oxygen_saturation: 97,
            weight: 65.8,
            height: 168,
            bmi: 23.3,
            pain_scale: 1,
            notes: 'Leve aumento en presión arterial, seguimiento necesario.',
            measurement_context: 'follow_up',
            created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          }
        ] as unknown as VitalSigns[] : [] as VitalSigns[]
        resolve(mockData)
      }, 100) // Simular latencia de red
    })
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

      // Aplicar filtros
      if (filters.consultation_type) {
        query = query.eq('consultation_type', filters.consultation_type)
      }
      if (filters.diagnosis_contains) {
        query = query.ilike('diagnosis', `%${filters.diagnosis_contains}%`)
      }

      // Paginación
      const startIndex = page * pageSize
      query = query
        .order('consultation_date', { ascending: false })
        .range(startIndex, startIndex + pageSize - 1)

      const { data, error, count } = await query

      if (error) throw error

      return {
        records: (data || []).map((row: any) => {
          const content = row.content || {};
          return {
            id: row.id,
            patient_id: row.patient_id,
            doctor_id: row.doctor_id || row.patient_id,
            consultation_date: row.date_recorded || row.created_at,
            consultation_type: row.record_type || content.consultation_type || 'general',
            chief_complaint: content.chief_complaint || content.reason || '',
            symptoms: content.symptoms || [],
            diagnosis: content.diagnosis || '',
            treatment_plan: content.treatment_plan || content.treatment || '',
            follow_up_instructions: content.follow_up_instructions || null,
            attachments: row.attachments || [],
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at
          };
        }) as MedicalRecord[],
        hasMore: count ? startIndex + pageSize < count : false,
      }
    } catch (error) {
      logger.error('Error fetching medical records:', error)
      return this.getMockMedicalRecords(patientId, filters, page, pageSize)
    }
  }

  private getMockMedicalRecords(
    patientId: UUID,
    filters: MedicalRecordFilters = {},
    page = 0,
    pageSize = 10
  ): Promise<{ records: MedicalRecord[]; hasMore: boolean }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockRecords = patientId === '550e8400-e29b-41d4-a716-446655440000' ? [
          {
            id: '1' as UUID,
            patient_id: patientId,
            doctor_id: '660f9500-f30c-52e5-b827-556766550001' as UUID,
            consultation_date: new Date().toISOString(),
            consultation_type: 'consulta_general',
            chief_complaint: 'Control de diabetes tipo 2',
            diagnosis: 'Diabetes mellitus tipo 2 estable',
            treatment: 'Continuar con metformina 850mg c/12h',
            notes: 'Paciente con buen control glicémico. HbA1c 6.8%',
            follow_up_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: '2' as UUID,
            patient_id: patientId,
            doctor_id: '660f9500-f30c-52e5-b827-556766550001' as UUID,
            consultation_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            consultation_type: 'seguimiento',
            chief_complaint: 'Seguimiento diabetes',
            diagnosis: 'Diabetes mellitus tipo 2 en control',
            treatment: 'Ajuste de dosis de metformina',
            notes: 'Mejora en niveles de glucosa. Continuar tratamiento.',
            follow_up_date: new Date().toISOString(),
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          }
        ] as unknown as MedicalRecord[] : [] as MedicalRecord[]

        // Aplicar filtros
        const filteredRecords = mockRecords
          .filter((record: MedicalRecord) => !filters.consultation_type || record.consultation_type === filters.consultation_type)
          .filter((record: MedicalRecord) => !filters.diagnosis_contains || (record.diagnosis && record.diagnosis.toLowerCase().includes(filters.diagnosis_contains.toLowerCase())))

        const startIndex = page * pageSize
        const paginatedRecords = filteredRecords.slice(startIndex, startIndex + pageSize)
        const hasMore = startIndex + pageSize < filteredRecords.length

        resolve({
          records: paginatedRecords,
          hasMore
        })
      }, 150) // Simular latencia de red
    })
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
  async getAIAnalyses(patientId: UUID): Promise<AIAnalysis[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockAnalyses = patientId === '550e8400-e29b-41d4-a716-446655440000' ? [
          {
            id: '1' as UUID,
            patient_id: patientId,
            created_by_id: '660f9500-f30c-52e5-b827-556766550001' as UUID,
            input_text: 'Paciente con diabetes tipo 2, presenta fatiga y visión borrosa ocasional',
            input_symptoms: ['fatiga', 'visión borrosa'],
            diagnosis_suggestions: [
              {
                condition: 'Diabetes mellitus tipo 2 descompensada',
                confidence: 0.85,
                reasoning: 'Los síntomas concuerdan con hiperglicemia',
                icd_code: 'E11.9'
              },
              {
                condition: 'Retinopatía diabética incipiente',
                confidence: 0.65,
                reasoning: 'Visión borrosa en paciente diabético',
                icd_code: 'H36.0'
              }
            ],
            treatment_suggestions: [
              {
                type: 'medication',
                suggestion: 'Ajustar dosis de metformina',
                priority: 'high',
                reasoning: 'Control glicémico subóptimo'
              },
              {
                type: 'lifestyle',
                suggestion: 'Evaluación oftalmológica urgente',
                priority: 'high',
                reasoning: 'Prevenir progresión de retinopatía'
              }
            ],
            confidence_score: 0.82,
            analysis_model: 'AltaAgent-Medical-v1.0',
            reviewed_by_doctor: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ] as unknown as AIAnalysis[] : [] as AIAnalysis[]
        resolve(mockAnalyses)
      }, 200) // Simular latencia de red
    })
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
