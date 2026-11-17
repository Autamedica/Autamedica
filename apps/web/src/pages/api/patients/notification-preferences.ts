import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'

const DEFAULTS = { email: true, push: true }

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data, error } = await admin.from('patient_notification_preferences')
      .select('email_enabled,push_enabled')
      .eq('user_id', context.userId)
      .maybeSingle()
    if (error) return internalError('notification_preferences_read_failed')
    return jsonOk({
      email: typeof data?.email_enabled === 'boolean' ? data.email_enabled : DEFAULTS.email,
      push: typeof data?.push_enabled === 'boolean' ? data.push_enabled : DEFAULTS.push,
    })
  } catch {
    return internalError('notification_preferences_read_failed')
  }
}

export const PATCH: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  const body = await request.json().catch(() => null) as { email?: unknown; push?: unknown } | null
  if (!body || (body.email !== undefined && typeof body.email !== 'boolean')
    || (body.push !== undefined && typeof body.push !== 'boolean')
    || (body.email === undefined && body.push === undefined)) {
    return badRequest('invalid_notification_preferences')
  }
  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: current, error: readError } = await admin.from('patient_notification_preferences')
      .select('email_enabled,push_enabled').eq('user_id', context.userId).maybeSingle()
    if (readError) return internalError('notification_preferences_read_failed')
    const payload = {
      user_id: context.userId,
      email_enabled: typeof body.email === 'boolean' ? body.email : current?.email_enabled ?? DEFAULTS.email,
      push_enabled: typeof body.push === 'boolean' ? body.push : current?.push_enabled ?? DEFAULTS.push,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await admin.from('patient_notification_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select('email_enabled,push_enabled')
      .single()
    if (error || !data) return internalError('notification_preferences_save_failed')
    return jsonOk({ email: data.email_enabled, push: data.push_enabled })
  } catch {
    return internalError('notification_preferences_save_failed')
  }
}
