import type { APIRoute } from 'astro'
import { withAuthRole, ADMIN_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false
const ALLOWED = ['jordan_qr_payments_enabled','pharmacy_express_payments_enabled','global_pix_mp_payments_enabled'] as const
type SwitchName = typeof ALLOWED[number]

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals)
  if (!isAuthed(auth)) return auth
  const db = createAstroAdminClient(locals.runtime?.env) as any
  const { data, error } = await db.from('platform_operational_switches').select('*').eq('id','global').maybeSingle()
  if (error) return internalError('payment_switches_unavailable')
  return jsonOk(data ?? { jordan_qr_payments_enabled:true, pharmacy_express_payments_enabled:true, global_pix_mp_payments_enabled:true })
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals)
  if (!isAuthed(auth)) return auth
  const body = await request.json().catch(() => null) as { key?:string; enabled?:boolean; reason?:string } | null
  if (!body || !ALLOWED.includes(body.key as SwitchName) || typeof body.enabled !== 'boolean') return badRequest('invalid_payment_switch')
  const db = createAstroAdminClient(locals.runtime?.env)
  const { data, error } = await db.from('platform_operational_switches').upsert({
    id:'global', [body.key as SwitchName]:body.enabled, updated_by:auth.user.id,
    reason: typeof body.reason === 'string' ? body.reason.slice(0,500) : null, updated_at:new Date().toISOString(),
  }, { onConflict:'id' }).select('*').single()
  if (error) return internalError('payment_switch_update_failed')
  await db.from('audit_logs').insert({user_id:auth.user.id,action:'platform_payment_switch_updated',resource_type:'platform_operational_switches',metadata:{key:body.key,enabled:body.enabled,reason:body.reason ?? null}})
  return jsonOk(data)
}
