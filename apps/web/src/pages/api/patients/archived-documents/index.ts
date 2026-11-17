import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'

type ArchiveRow = {
  reference: string
  status: 'registered' | 'revoked'
  document_date: string
  registered_at: string
  pdf_sha256: string
  signature_type: 'scanned_signature'
  issuer_snapshot: Record<string, unknown> | null
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const { data, error } = await admin
      .from('medical_document_archive_patient_links')
      .select('medical_document_archives(reference,status,document_date,registered_at,pdf_sha256,signature_type,issuer_snapshot)')
      .eq('patient_id', context.patientId)

    if (error) throw error

    const archives = (data ?? []).flatMap((link) => {
      const row = link.medical_document_archives as unknown as ArchiveRow | ArchiveRow[] | null
      const archive = Array.isArray(row) ? row[0] : row
      if (!archive || !/^DOC-[A-F0-9]{32}$/.test(archive.reference) ||
          !['registered', 'revoked'].includes(archive.status) ||
          archive.signature_type !== 'scanned_signature' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(archive.document_date) ||
          !/^[a-f0-9]{64}$/.test(archive.pdf_sha256)) return []

      const issuer = archive.issuer_snapshot && typeof archive.issuer_snapshot === 'object'
        ? archive.issuer_snapshot
        : {}
      return [{
        reference: archive.reference,
        status: archive.status,
        documentDate: archive.document_date,
        registeredAt: archive.registered_at,
        pdfSha256: archive.pdf_sha256,
        signatureType: archive.signature_type,
        issuer: {
          name: typeof issuer.name === 'string' ? issuer.name : null,
          profession: typeof issuer.profession === 'string' ? issuer.profession : null,
          license: typeof issuer.license === 'string' ? issuer.license : null,
          jurisdiction: typeof issuer.jurisdiction === 'string' ? issuer.jurisdiction : null,
        },
      }]
    })

    return new Response(JSON.stringify({ success: true, data: archives }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    logger.error('[patient-archived-documents/GET]', error)
    return new Response(JSON.stringify({ success: false, error: 'internal_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
}
