import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { internalError, notFound, unauthorized } from '@/lib/api-helpers'
import { logger } from '@autamedica/shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Short-lived patient-owned link to a signed medical order stored in the private bucket. */
export const GET: APIRoute = async ({ params, request, locals }) => {
  const orderId = params.id?.trim()
  if (!orderId || !UUID.test(orderId)) return notFound('medical_order_not_found')

  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: order, error } = await admin.from('medical_orders')
      .select('id,patient_id,status')
      .eq('id', orderId)
      .eq('patient_id', context.patientId)
      .maybeSingle()

    if (error) {
      logger.error('[patients/medical-orders/pdf] lookup failed', { code: error.code ?? 'INTERNAL' })
      return internalError()
    }
    if (!order || order.status !== 'signed') return notFound('medical_order_not_found')

    const path = `medical-orders/${order.id}.pdf`
    const { data, error: signedUrlError } = await admin.storage
      .from('medical-documents')
      .createSignedUrl(path, 90)

    if (signedUrlError || !data?.signedUrl) {
      logger.error('[patients/medical-orders/pdf] signed URL generation failed', {
        code: signedUrlError?.name ?? 'SIGNED_URL_UNAVAILABLE',
      })
      return notFound('medical_order_pdf_unavailable')
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
    logger.error('[patients/medical-orders/pdf] unexpected failure', {
      name: error instanceof Error ? error.name : typeof error,
    })
    return internalError()
  }
}
