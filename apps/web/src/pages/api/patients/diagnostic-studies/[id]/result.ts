import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { internalError, notFound, unauthorized } from '@/lib/api-helpers'
import { logger } from '@autamedica/shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Short-lived, patient-owned link to an available diagnostic study result in private storage. */
export const GET: APIRoute = async ({ params, request, locals }) => {
  const studyId = params.id?.trim()
  if (!studyId || !UUID.test(studyId)) return notFound('diagnostic_study_not_found')

  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: study, error } = await admin.from('diagnostic_studies')
      .select('id,patient_id,status,result_storage_path')
      .eq('id', studyId)
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (error) {
      logger.error('[patients/diagnostic-studies/result] lookup failed', { code: error.code ?? 'INTERNAL' })
      return internalError()
    }
    if (study?.status !== 'available') return notFound('diagnostic_study_result_not_available')

    const storagePath = String(study.result_storage_path ?? '')
    if (!storagePath || storagePath.startsWith('/')
      || storagePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
      return notFound('diagnostic_study_result_not_available')
    }
    const { data, error: signedUrlError } = await admin.storage
      .from('medical-documents')
      .createSignedUrl(storagePath, 90)

    if (signedUrlError || !data?.signedUrl) {
      logger.error('[patients/diagnostic-studies/result] signed URL generation failed', {
        code: signedUrlError?.name ?? 'SIGNED_URL_UNAVAILABLE',
      })
      return notFound('diagnostic_study_result_not_available')
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: data.signedUrl,
        'Cache-Control': 'private, no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    logger.error('[patients/diagnostic-studies/result] unexpected failure', {
      name: error instanceof Error ? error.name : typeof error,
    })
    return internalError()
  }
}
