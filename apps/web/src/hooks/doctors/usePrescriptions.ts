import { useCallback, useEffect, useState } from 'react'
import { createBrowserClient } from '@autamedica/auth/client'
import { logger, toCamel, toSnake } from '@autamedica/shared'
import type {
  Prescription,
  PrescriptionFilters,
  PrescriptionStatus,
  UsePrescriptionsResult,
  UUID
} from '@/types/medical'
interface UsePrescriptionsOptions {
  filters?: PrescriptionFilters
}

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

interface UiMedicalRecord {
  id: string
  patientId: string | null
  doctorId: string | null
  title: string
  type: string
  content: unknown
  dateRecorded: string | null
  createdAt: string | null
  updatedAt: string | null
}

const PRESCRIPTIONS_CHANGED_EVENT = 'medical-prescriptions:changed'

function getPrescriptionContent(content: unknown): PrescriptionContent {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content as PrescriptionContent
  }
  return {}
}

function deriveStatus(content: PrescriptionContent, fallbackDate: string): PrescriptionStatus {
  if (content.status && ['activa', 'completada', 'cancelada', 'pausada'].includes(content.status)) {
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

async function resolveCurrentDoctorId(): Promise<string | null> {
  const supabase = createBrowserClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    if (userError) {
      logger.warn('[usePrescriptions] No se pudo resolver auth user', userError)
    }
    return null
  }

  const { data, error } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    logger.warn('[usePrescriptions] No se pudo resolver doctor_id', error)
    return null
  }

  return data?.id ?? null
}

function applyFilters(
  prescriptions: Prescription[],
  filters: PrescriptionFilters
): Prescription[] {
  let filtered = prescriptions

  if (filters.status) {
    filtered = filtered.filter((prescription) => prescription.status === filters.status)
  }

  if (filters.medication_name) {
    const search = filters.medication_name.toLowerCase()
    filtered = filtered.filter((prescription) =>
      prescription.medication_name.toLowerCase().includes(search)
    )
  }

  if (filters.active_only) {
    const now = new Date()
    filtered = filtered.filter((prescription) =>
      prescription.status === 'activa' &&
      new Date(prescription.start_date) <= now &&
      (!prescription.end_date || new Date(prescription.end_date) >= now)
    )
  }

  return filtered
}

export function usePrescriptions(
  patientId: UUID | null,
  options: UsePrescriptionsOptions = {}
): UsePrescriptionsResult {
  const { filters = {} } = options

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => setIsClient(true), [])

  const fetchPrescriptions = useCallback(async (): Promise<void> => {
    if (!patientId || !isClient) {
      setPrescriptions([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createBrowserClient()
      const { data: rawData, error: dbError } = await supabase
        .from('medical_records')
        .select('*')
        .is('deleted_at', null)
        .order('date_recorded', { ascending: false });
      if (dbError) throw dbError;
      const records = toCamel<UiMedicalRecord[]>(rawData ?? [])

      const nextPrescriptions = applyFilters(
        records
          .filter((record) => record.patientId === patientId && record.type === 'prescription')
          .map(mapRecordToPrescription),
        filters
      )

      setPrescriptions(nextPrescriptions)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar prescripciones: ${message}`)
      logger.error('[usePrescriptions] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, patientId])

  const addPrescription = useCallback(async (
    prescription: Omit<Prescription, 'id' | 'created_at' | 'updated_at'>
  ): Promise<void> => {
    if (!patientId) {
      throw new Error('ID de paciente requerido')
    }

    setError(null)

    try {
      const doctorId = prescription.doctor_id || await resolveCurrentDoctorId()
      const recordedAt = prescription.prescribed_date || prescription.start_date || new Date().toISOString()

      const supabase = createBrowserClient()
      const insertPayload = {
        patient_id: patientId,
        doctor_id: doctorId,
        type: 'prescription',
        title: prescription.medication_name
          ? `Prescripción: ${prescription.medication_name}`
          : 'Prescripción médica',
        visibility: 'patient',
        date_recorded: recordedAt,
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
      const dbPayload = toSnake(insertPayload)
      const { error: insertError } = await supabase.from('medical_records').insert(dbPayload as never)
      if (insertError) throw insertError

      window.dispatchEvent(new Event(PRESCRIPTIONS_CHANGED_EVENT))
      await fetchPrescriptions()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al guardar prescripción: ${message}`)
      logger.error('[usePrescriptions] add error:', err)
      throw err
    }
  }, [fetchPrescriptions, patientId])

  const updatePrescription = useCallback(async (
    id: UUID,
    updates: Partial<Prescription>
  ): Promise<void> => {
    setError(null)

    try {
      const current = prescriptions.find((prescription) => prescription.id === id)

      if (!current) {
        throw new Error('Prescripción no encontrada en memoria')
      }

      const merged = { ...current, ...updates }

      const supabase = createBrowserClient()
      const updatePayload = {
        doctor_id: merged.doctor_id || await resolveCurrentDoctorId(),
        title: merged.medication_name
          ? `Prescripción: ${merged.medication_name}`
          : 'Prescripción médica',
        date_recorded: merged.prescribed_date || merged.start_date || current.prescribed_date,
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
      const dbPayload = toSnake(updatePayload) as Record<string, unknown>
      const { error: updateError } = await supabase.from('medical_records').update(dbPayload).eq('id', id)
      if (updateError) throw updateError

      window.dispatchEvent(new Event(PRESCRIPTIONS_CHANGED_EVENT))
      await fetchPrescriptions()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al actualizar prescripción: ${message}`)
      logger.error('[usePrescriptions] update error:', err)
      throw err
    }
  }, [fetchPrescriptions, prescriptions])

  useEffect(() => {
    void fetchPrescriptions()
  }, [fetchPrescriptions])

  useEffect(() => {
    const handleChanged = (): void => {
      void fetchPrescriptions()
    }

    window.addEventListener(PRESCRIPTIONS_CHANGED_EVENT, handleChanged)
    return () => {
      window.removeEventListener(PRESCRIPTIONS_CHANGED_EVENT, handleChanged)
    }
  }, [fetchPrescriptions])

  return {
    prescriptions,
    loading,
    error,
    addPrescription,
    updatePrescription,
  }
}
