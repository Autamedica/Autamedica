/**
 * Hook: usePatientReports — fetches and manages patient medical reports.
 *
 * Architecture: Capa 2 (Hook/Controller) — manages state, delegates to API Client (Capa 4).
 * No business logic here — just state + API calls.
 */
import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'

export interface PatientReport {
  id: string
  title: string
  type: string
  dateRecorded: string | null
  doctorName: string | null
  hasSoap: boolean
  aiGenerated: boolean
}

interface UsePatientReportsReturn {
  reports: PatientReport[]
  loading: boolean
  error: string | null
  downloadPdf: (reportId: string) => Promise<void>
  downloading: string | null
  refresh: () => Promise<void>
}

export function usePatientReports(): UsePatientReportsReturn {
  const [reports, setReports] = useState<PatientReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await fetchApi<PatientReport[]>('/api/patients/reports')
      setReports(result ?? [])
    } catch (err) {
      logger.error('[usePatientReports] fetch failed', err)
      setError('No se pudieron cargar los informes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const downloadPdf = useCallback(async (reportId: string) => {
    try {
      setDownloading(reportId)

      const response = await fetch(`/api/patients/reports/${reportId}/pdf`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`PDF download failed: ${response.status}`)
      }

      const blob = await response.blob()
      const filename = response.headers.get('Content-Disposition')
        ?.match(/filename="(.+)"/)?.[1] ?? `informe-${reportId.slice(0, 8)}.pdf`

      // Trigger browser download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      logger.error('[usePatientReports] PDF download failed', err)
      setError('No se pudo descargar el PDF')
    } finally {
      setDownloading(null)
    }
  }, [])

  return {
    reports,
    loading,
    error,
    downloadPdf,
    downloading,
    refresh: fetchReports,
  }
}
