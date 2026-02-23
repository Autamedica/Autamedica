/**
 * API – Historial Médico del Paciente
 * GET /api/medical-history → Resumen y timeline del historial del paciente autenticado
 */

import { createRouteHandlerClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = (await createRouteHandlerClient()) as any

    const { data: { session }, error: authError } = await supabase.auth.getSession()
    if (authError || !session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const userId = session.user.id

    // Cargar registros médicos visibles del paciente
    const { data: medicalRecords, error: recordsError } = await supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', userId)
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
      .eq('patient_id', userId)
      .maybeSingle()

    const recs = medicalRecords || []
    const activeMedications = recs.filter((r: any) => r.type === 'prescription' && (r.content as any)?.status === 'active')
    const recentDiagnoses = recs.filter((r: any) => r.type === 'diagnosis')

    const summary = {
      patient_id: userId,
      active_conditions_count: recentDiagnoses.length,
      active_medications_count: activeMedications.length,
      known_allergies_count: 0,
      last_encounter_date: recs?.[0]?.created_at || new Date().toISOString(),
      chronic_conditions: recentDiagnoses.map((d: any) => ({
        condition: d.title,
        diagnosed_date: d.created_at || d.date_recorded || new Date().toISOString(),
        icd10_code: (d.content as any)?.icd10_code || undefined,
        status: 'active' as const,
      })),
      critical_allergies: [],
      current_medications: activeMedications.map((m: any) => {
        const c = m.content as any
        return {
          medication_name: m.title,
          dosage: c?.dosage || 'No especificado',
          frequency: c?.frequency || 'Según indicación médica',
          start_date: m.created_at || m.date_recorded,
          route: c?.route || 'oral',
        }
      }),
    }

    const timeline = {
      patient_id: userId,
      sections: {
        conditions: recentDiagnoses.map((r: any) => ({
          id: r.id,
          condition: r.title,
          diagnosed_date: r.created_at || r.date_recorded || new Date().toISOString(),
          icd10_code: (r.content as any)?.icd10_code || undefined,
          status: 'active' as const,
          notes: (r.content as any)?.notes || undefined,
        })),
        allergies: [],
        medications: activeMedications.map((m: any) => {
          const c = m.content as any
          return {
            id: m.id,
            medication_name: m.title,
            dosage: c?.dosage || 'No especificado',
            frequency: c?.frequency || 'Según indicación médica',
            route: c?.route || 'oral',
            start_date: m.created_at || m.date_recorded,
            end_date: c?.end_date || null,
            prescribing_doctor: m.doctor_id || undefined,
            reason: c?.notes || 'No especificado',
          }
        }),
        procedures: recs
          .filter((r: any) => r.type === 'procedure')
          .map((p: any) => ({
            id: p.id,
            procedure_name: p.title,
            date: p.created_at || p.date_recorded,
            provider: p.doctor_id || undefined,
            facility: (p.content as any)?.facility || undefined,
            outcome: (p.content as any)?.outcome || undefined,
          })),
        encounters: recs
          .filter((r: any) => r.type === 'encounter' || r.type === 'note' || r.type === 'consultation')
          .map((e: any) => ({
            id: e.id,
            date: e.created_at || e.date_recorded,
            type: 'consultation' as const,
            provider: e.doctor_id || undefined,
            reason: e.title,
            diagnosis: (e.content as any)?.diagnosis || undefined,
            notes: (e.content as any)?.notes || undefined,
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
