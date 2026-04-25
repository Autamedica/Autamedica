'use client'

import { useCallback, useEffect, useState } from 'react'
import { logger } from '@autamedica/shared'
import { fetchApi, ApiError } from '@/lib/api-client'
import type { AnamnesisSummary } from '@autamedica/shared'

export interface PatientContextData {
  hasAnamnesis: boolean
  chiefComplaint: string | null
  allergies: string[]
  medications: string | null
  chronicDiseases: string[]
  summary: AnamnesisSummary | null
}

interface AnamnesisApiResponse {
  anamnesis: { id: string; status: string; privacy_accepted: boolean | null }
  summary: AnamnesisSummary
  sections: Array<{ section: string; data: Record<string, unknown>; completed: boolean | null }>
}

function extractFromSummary(summary: AnamnesisSummary): Omit<PatientContextData, 'hasAnamnesis' | 'summary'> {
  let chiefComplaint: string | null = null
  const allergies: string[] = []
  let medications: string | null = null
  const chronicDiseases: string[] = []

  for (const section of summary.sections) {
    const title = section.title.toLowerCase()

    if (title.includes('motivo')) {
      // Extract chief complaint from first item
      const first = section.items[0]
      if (first) {
        const match = first.match(/"([^"]+)"/)
        chiefComplaint = match?.[1] ?? first.replace(/^[^:]+:\s*/, '').slice(0, 120)
      }
    }

    if (title.includes('patologico') || title.includes('patológico')) {
      for (const item of section.items) {
        const lower = item.toLowerCase()
        if (lower.includes('alergia') && !lower.includes('no documentado') && !lower.includes('niega')) {
          const match = item.match(/referidas?:\s*(.+)\.?$/)
          if (match?.[1]) allergies.push(match[1].trim())
        }
        if (lower.includes('medicacion') || lower.includes('medicación')) {
          if (!lower.includes('no documentado') && !lower.includes('niega')) {
            const match = item.match(/referida:\s*(.+)\.?$/)
            if (match?.[1]) medications = match[1].trim()
          }
        }
        if (lower.includes('antecedentes patologicos relevados')) {
          const match = item.match(/relevados:\s*(.+)\.?$/)
          if (match?.[1]) {
            chronicDiseases.push(...match[1].split(',').map(d => d.trim()).filter(Boolean))
          }
        }
      }
    }
  }

  return { chiefComplaint, allergies, medications, chronicDiseases }
}

interface UsePatientContextResult {
  context: PatientContextData | null
  loading: boolean
  error: string | null
}

export function usePatientContext(patientId: string | null): UsePatientContextResult {
  const [context, setContext] = useState<PatientContextData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchContext = useCallback(async () => {
    if (!patientId) {
      setContext(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await fetchApi<AnamnesisApiResponse>(
        `/api/doctors/patients/${patientId}/anamnesis`
      )

      const extracted = extractFromSummary(data.summary)
      setContext({
        hasAnamnesis: true,
        summary: data.summary,
        ...extracted,
      })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        // No anamnesis or not shared - not an error, just empty
        setContext({
          hasAnamnesis: false,
          chiefComplaint: null,
          allergies: [],
          medications: null,
          chronicDiseases: [],
          summary: null,
        })
      } else {
        logger.error('[usePatientContext] fetch error', err)
        setError('Error al cargar contexto')
      }
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    fetchContext()
  }, [fetchContext])

  return { context, loading, error }
}
