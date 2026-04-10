'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchApi } from '@/lib/api-client'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { logger } from '@autamedica/shared'
import type { UUID } from '@autamedica/types'

export interface AnamnesisFileSummary {
  id: string
  status: string
  updatedAt: string | null
  completionPct: number
  chiefComplaint: string | null
  medications: string[]
  diagnoses: string[]
  allergies: string[]
}

export interface TriageSnapshot {
  priority: 'urgent' | 'priority' | 'routine'
  mandate: string
  medicationName: string | null
  medicationDose: string | null
  daysRemaining: number | null
  riskOfInterruption: 'low' | 'medium' | 'high'
  requiresSameDayAction: boolean
  status: string
  vertical: string
}

export interface PatientClinicalFileData {
  anamnesis: AnamnesisFileSummary | null
  triage: TriageSnapshot | null
  anamnesisError: string | null
  triageError: string | null
  loading: boolean
  refetch: () => void
}

type RawSection = {
  section: string
  data: Record<string, unknown> | null
  completed: boolean
  updated_at: string | null
}

function extractFromSections(sections: RawSection[]): Pick<AnamnesisFileSummary, 'chiefComplaint' | 'medications' | 'diagnoses' | 'allergies' | 'completionPct'> {
  const completed = sections.filter(s => s.completed).length
  const completionPct = sections.length > 0 ? Math.round((completed / sections.length) * 100) : 0

  let chiefComplaint: string | null = null
  const medications: string[] = []
  const diagnoses: string[] = []
  const allergies: string[] = []

  for (const s of sections) {
    const d = s.data
    if (!d) continue

    if (s.section === 'chief_complaint' || s.section === 'motivo_consulta') {
      const raw = d.raw_text ?? d.rawText ?? d.description ?? d.motivo
      if (typeof raw === 'string' && raw.trim()) chiefComplaint = raw.trim()
    }

    if (s.section === 'medications' || s.section === 'medicamentos') {
      const list = d.list ?? d.medications ?? d.medicamentos
      if (Array.isArray(list)) {
        for (const item of list) {
          const name = typeof item === 'string' ? item : (item as Record<string, unknown>)?.name ?? (item as Record<string, unknown>)?.nombre
          if (typeof name === 'string' && name.trim()) medications.push(name.trim())
        }
      }
    }

    if (s.section === 'diagnoses' || s.section === 'diagnosticos' || s.section === 'medical_history') {
      const list = d.conditions ?? d.diagnoses ?? d.diagnosticos
      if (Array.isArray(list)) {
        for (const item of list) {
          const label = typeof item === 'string' ? item : (item as Record<string, unknown>)?.name ?? (item as Record<string, unknown>)?.label
          if (typeof label === 'string' && label.trim()) diagnoses.push(label.trim())
        }
      }
    }

    if (s.section === 'allergies' || s.section === 'alergias') {
      const list = d.list ?? d.allergies ?? d.alergias
      if (Array.isArray(list)) {
        for (const item of list) {
          const label = typeof item === 'string' ? item : (item as Record<string, unknown>)?.name
          if (typeof label === 'string' && label.trim()) allergies.push(label.trim())
        }
      }
    }
  }

  return { chiefComplaint, medications, diagnoses, allergies, completionPct }
}

type RawAnamnesisResponse = {
  anamnesis: { id: string; status: string; privacy_accepted: boolean }
  sections: RawSection[]
}

type RawTriageRow = {
  triage_priority_rank: number
  triage_mandate: string
  clinical_vertical: string
  triage_status: string
  risk_of_interruption: 'low' | 'medium' | 'high'
  requires_same_day_action: boolean
  medication_snapshot_name: string | null
  medication_snapshot_dose: string | null
  medication_snapshot_days_remaining: number | null
  updated_at: string
}

function rankToPriority(rank: number): TriageSnapshot['priority'] {
  if (rank === 1) return 'urgent'
  if (rank === 2) return 'priority'
  return 'routine'
}

export function usePatientClinicalFile(patientId: UUID | null): PatientClinicalFileData {
  const [anamnesis, setAnamnesis] = useState<AnamnesisFileSummary | null>(null)
  const [triage, setTriage] = useState<TriageSnapshot | null>(null)
  const [anamnesisError, setAnamnesisError] = useState<string | null>(null)
  const [triageError, setTriageError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  const fetchAll = useCallback(async () => {
    if (!patientId || !isClient) return

    setLoading(true)
    setAnamnesisError(null)
    setTriageError(null)

    await Promise.all([
      fetchApi<RawAnamnesisResponse>(`/api/doctors/patients/${patientId}/anamnesis`)
        .then((res) => {
          const extracted = extractFromSections(res.sections)
          const lastSection = res.sections
            .filter(s => s.updated_at)
            .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())[0]

          setAnamnesis({
            id: res.anamnesis.id,
            status: res.anamnesis.status,
            updatedAt: lastSection?.updated_at ?? null,
            ...extracted,
          })
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('404') || msg.includes('not_found')) {
            setAnamnesis(null)
          } else if (msg.includes('403') || msg.includes('forbidden') || msg.includes('not_shared')) {
            setAnamnesisError('El paciente no ha compartido su anamnesis.')
          } else {
            setAnamnesisError('No se pudo cargar la anamnesis.')
            logger.warn('[usePatientClinicalFile] anamnesis fetch failed', err)
          }
        }),

      (async () => {
        try {
          const supabase = getBrowserSupabaseClient()
          const { data, error } = await (supabase as unknown as {
            from: (t: string) => {
              select: (cols: string) => {
                eq: (col: string, val: string) => {
                  not: (col: string, op: string, val: string) => {
                    order: (col: string, opts: Record<string, unknown>) => {
                      limit: (n: number) => {
                        maybeSingle: () => Promise<{ data: RawTriageRow | null; error: unknown }>
                      }
                    }
                  }
                }
              }
            }
          }).from('clinical_case_states')
            .select('triage_priority_rank,triage_mandate,clinical_vertical,triage_status,risk_of_interruption,requires_same_day_action,medication_snapshot_name,medication_snapshot_dose,medication_snapshot_days_remaining,updated_at')
            .eq('patient_id', patientId)
            .not('triage_status', 'eq', 'resolved')
            .order('triage_priority_rank', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (error) throw error

          if (data) {
            setTriage({
              priority: rankToPriority(data.triage_priority_rank),
              mandate: data.triage_mandate,
              medicationName: data.medication_snapshot_name,
              medicationDose: data.medication_snapshot_dose,
              daysRemaining: data.medication_snapshot_days_remaining,
              riskOfInterruption: data.risk_of_interruption,
              requiresSameDayAction: data.requires_same_day_action,
              status: data.triage_status,
              vertical: data.clinical_vertical,
            })
          } else {
            setTriage(null)
          }
        } catch (err) {
          logger.warn('[usePatientClinicalFile] triage fetch failed', err)
          setTriageError(null) // non-critical, silent
        }
      })(),
    ])

    setLoading(false)
  }, [patientId, isClient])

  useEffect(() => { void fetchAll() }, [fetchAll])

  return { anamnesis, triage, anamnesisError, triageError, loading, refetch: fetchAll }
}
