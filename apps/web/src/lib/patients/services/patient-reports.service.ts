/**
 * Service: Patient report PDF downloads.
 * Extracts blob/fetch operations from usePatientReports hook.
 */
import { fetchBlob } from '@/lib/api-client'

export const patientReportsService = {
  async downloadPdf(reportId: string): Promise<void> {
    const { blob, filename } = await fetchBlob(`/api/patients/reports/${encodeURIComponent(reportId)}/pdf`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename ?? `informe-${reportId.slice(0, 8)}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}
