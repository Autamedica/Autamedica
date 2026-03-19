/**
 * API – Historial Médico del Paciente
 * GET /api/medical-history → Resumen y timeline del historial del paciente autenticado
 */

import { createRouteHandlerClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { NextResponse } from 'next/server'
import { resolvePatientContext } from '../shared/patient-context'

export async function GET() {
  try {
    const supabase = await createRouteHandlerClient()
    const context = await resolvePatientContext(supabase)
    if (!context) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Cargar registros médicos visibles del paciente
    const { data: medicalRecords, error: recordsError } = await supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', context.patientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    // Si la tabla no existe o RLS impide leer, devolvemos vacío pero no 500
    if (recordsError) {
      logger.warn('[GET /api/medical-history] recordsError (devolviendo vacío)', recordsError)
    }

    // Opcional: anamnesis
    const { data: anamnesisData } = await supabase
      .from('anamnesis')
      .select('*')
      .eq('patient_id', context.patientId)
      .maybeSingle()

    const recs = (medicalRecords ?? []) as Array<{
      id: string
      title: string
      type: string
      created_at: string | null
      date_recorded: string | null
      doctor_id: string | null
      content: Record<string, unknown> | null
    }>

    const isPrescriptionActive = (content: Record<string, unknown> | null): boolean => {
      const status = typeof content?.status === 'string' ? content.status : null
      if (status === 'active' || status === 'activa') return true
      if (status === 'completed' || status === 'completada' || status === 'cancelled' || status === 'cancelada') {
        return false
      }

      const endDate = typeof content?.end_date === 'string' ? content.end_date : null
      return !endDate || new Date(endDate) >= new Date()
    }

    const getMedicationLabel = (record: typeof recs[number]): string => {
      const content = record.content ?? {}
      const medicationName = typeof content.medication_name === 'string' ? content.medication_name : null
      return medicationName || record.title
    }

    const activeMedications = recs.filter((record) => record.type === 'prescription' && isPrescriptionActive(record.content))
    const recentDiagnoses = recs.filter((record) => record.type === 'diagnosis')

    const summary = {
      patient_id: context.patientId,
      active_conditions_count: recentDiagnoses.length,
      active_medications_count: activeMedications.length,
      known_allergies_count: 0,
      last_encounter_date: recs?.[0]?.created_at || new Date().toISOString(),
      chronic_conditions: recentDiagnoses.map((record) => ({
        condition: record.title,
        diagnosed_date: record.created_at || record.date_recorded || new Date().toISOString(),
        icd10_code: typeof record.content?.icd10_code === 'string' ? record.content.icd10_code : undefined,
        status: 'active' as const,
      })),
      critical_allergies: [],
      current_medications: activeMedications.map((record) => {
        const content = record.content ?? {}
        return {
          medication_name: getMedicationLabel(record),
          dosage: typeof content.dosage === 'string' ? content.dosage : 'No especificado',
          frequency: typeof content.frequency === 'string' ? content.frequency : 'Según indicación médica',
          start_date: record.created_at || record.date_recorded,
          route: typeof content.route === 'string' ? content.route : 'oral',
        }
      }),
    }

    const timeline = {
      patient_id: context.patientId,
      sections: {
        conditions: recentDiagnoses.map((record) => ({
          id: record.id,
          condition: record.title,
          diagnosed_date: record.created_at || record.date_recorded || new Date().toISOString(),
          icd10_code: typeof record.content?.icd10_code === 'string' ? record.content.icd10_code : undefined,
          status: 'active' as const,
          notes: typeof record.content?.notes === 'string' ? record.content.notes : undefined,
        })),
        allergies: [],
        medications: activeMedications.map((record) => {
          const content = record.content ?? {}
          return {
            id: record.id,
            medication_name: getMedicationLabel(record),
            dosage: typeof content.dosage === 'string' ? content.dosage : 'No especificado',
            frequency: typeof content.frequency === 'string' ? content.frequency : 'Según indicación médica',
            route: typeof content.route === 'string' ? content.route : 'oral',
            start_date: record.created_at || record.date_recorded,
            end_date: typeof content.end_date === 'string' ? content.end_date : null,
            prescribing_doctor: record.doctor_id || undefined,
            reason: typeof content.notes === 'string' ? content.notes : 'No especificado',
          }
        }),
        procedures: recs
          .filter((record) => record.type === 'procedure')
          .map((record) => ({
            id: record.id,
            procedure_name: record.title,
            date: record.created_at || record.date_recorded,
            provider: record.doctor_id || undefined,
            facility: typeof record.content?.facility === 'string' ? record.content.facility : undefined,
            outcome: typeof record.content?.outcome === 'string' ? record.content.outcome : undefined,
          })),
        encounters: recs
          .filter((record) => record.type === 'encounter' || record.type === 'note' || record.type === 'consultation')
          .map((record) => ({
            id: record.id,
            date: record.created_at || record.date_recorded,
            type: 'consultation' as const,
            provider: record.doctor_id || undefined,
            reason: record.title,
            diagnosis: typeof record.content?.diagnosis === 'string' ? record.content.diagnosis : undefined,
            notes: typeof record.content?.notes === 'string' ? record.content.notes : undefined,
          })),
        immunizations: [],
      },
    }

    return NextResponse.json({ success: true, data: { summary, timeline, anamnesis: anamnesisData || null } })
  } catch (error) {
    logger.error('[GET /api/medical-history] Unexpected error (devolviendo vacío)', error as Error)
    return NextResponse.json({ success: true, data: { summary: null, timeline: null, anamnesis: null } })
  }
}
