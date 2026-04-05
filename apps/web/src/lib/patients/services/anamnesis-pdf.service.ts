/**
 * Service: Anamnesis PDF download and version management.
 * Extracts blob/fetch operations from useAnamnesisFlow hook.
 */
import { fetchApi, fetchBlob } from '@/lib/api-client'

export const anamnesisPdfService = {
  async downloadPdf(versionNumber?: number): Promise<void> {
    const url = versionNumber
      ? `/api/patients/anamnesis/pdf?version=${versionNumber}`
      : '/api/patients/anamnesis/pdf'

    const { blob, filename } = await fetchBlob(url)
    const blobUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = filename ?? 'historia-clinica.pdf'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(blobUrl)
  },

  async createVersion(notes: string): Promise<void> {
    await fetchApi('/api/patients/anamnesis/versions', { body: { notes } })
  },
}
