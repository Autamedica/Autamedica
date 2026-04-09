import { fetchBlob } from '@/lib/api-client'

export const psychiatryIntakePdfService = {
  async downloadPdf(): Promise<void> {
    const { blob, filename } = await fetchBlob('/api/patients/psychiatry-intake/pdf')
    const blobUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = filename ?? 'evaluacion-psiquiatrica-tdah.pdf'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(blobUrl)
  },
}
