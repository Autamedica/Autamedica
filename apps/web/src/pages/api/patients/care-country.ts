import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { isCareCountry } from '@/lib/patients/care-country'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, conflict, forbidden, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  const response = jsonOk({ care_country: context.careCountry })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const POST: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) return forbidden('cross_origin_request')
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  const isForm = request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')
  if (isForm && !origin) return forbidden('origin_required')
  let country: unknown
  let returnTo = '/'
  try {
    if (isForm) {
      const form = await request.formData()
      country = form.get('care_country')
      const target = form.get('return_to')
      if (typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
          && new URL(target, url).origin === url.origin) returnTo = target
    } else {
      const body: unknown = await request.json()
      country = body && typeof body === 'object' && 'care_country' in body ? body.care_country : undefined
    }
  } catch { return badRequest('invalid_country_request') }
  if (!isCareCountry(country)) return badRequest('care_country_must_be_AR_or_BR')
  if (context.careCountry && context.careCountry !== country) return conflict('care_country_already_selected')
  if (!context.careCountry) {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const { data, error } = await admin.from('patients')
      .update({ care_country: country }).eq('id', context.patientId)
      .eq('user_id', context.userId).is('care_country', null).select('care_country').maybeSingle()
    if (error) return internalError('care_country_save_failed')
    if (!data) return conflict('care_country_already_selected')
  }
  const response = isForm
    ? new Response(null, { status: 303, headers: { Location: returnTo } })
    : jsonOk({ care_country: country })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

