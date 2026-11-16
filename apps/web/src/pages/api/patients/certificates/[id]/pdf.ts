import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/api-helpers'
import { isMedicalCertificatePubliclyVerifiable } from '@/lib/doctors/services/medical-certificate-verification'
import { certificateSha256 } from '@/lib/doctors/services/certificate-electronic-assets'
import { logger } from '@autamedica/shared'

/** Patient-owned signed certificate PDF; no doctor session or SSR doctor route required. */
export const GET: APIRoute = async ({ params, request, locals }) => {
  const id = params.id?.trim()
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badRequest('invalid_certificate_id')
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: certificate, error } = await admin.from('medical_certificates')
      .select('*').eq('id', id).eq('patient_id', context.patientId).maybeSingle()
    if (error) return internalError('certificate_read_failed')
    if (!certificate) return notFound('certificate_not_found')
    if (certificate.status !== 'signed') return forbidden('certificate_not_available')
    if (!isMedicalCertificatePubliclyVerifiable(certificate as unknown as Parameters<typeof isMedicalCertificatePubliclyVerifiable>[0])) {
      return forbidden('certificate_signature_unverified')
    }
    const evidence = certificate as typeof certificate & { signature_hash?: string | null; signature_method?: string | null }
    const hash = evidence.signature_hash
    const storagePath = evidence.signature_method === 'electronic_verified'
      ? `certificates/electronic/${id}/${hash}.pdf`
      : `certificates/signed/${id}.pdf`
    if (!hash || certificate.signed_pdf_url !== storagePath) return forbidden('certificate_pdf_path_invalid')
    const { data, error: downloadError } = await admin.storage.from('medical-documents').download(storagePath)
    if (downloadError || !data) return notFound('certificate_pdf_missing')
    const pdf = new Uint8Array(await data.arrayBuffer())
    if (await certificateSha256(pdf) !== hash) return forbidden('certificate_pdf_integrity_mismatch')
    return new Response(Uint8Array.from(pdf).buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="atestado-${id}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    logger.error('[patients/certificates/pdf] delivery failed', {
      certificateId: id, errorName: error instanceof Error ? error.name : typeof error,
    })
    return internalError('certificate_pdf_failed')
  }
}
