import type { APIRoute } from 'astro'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false
const ALLOWED = ['jordan_qr_payments_enabled','pharmacy_express_payments_enabled','global_pix_mp_payments_enabled','whatsapp_send_enabled','email_send_enabled','dry_run_enabled'] as const
type SwitchName = typeof ALLOWED[number]

type SwitchAdmin = { user: { id: string } } | Response

async function requireSwitchAdmin(request: Request, locals: Parameters<APIRoute>[0] extends never ? never : any): Promise<SwitchAdmin> {
  const auth = await withAuth(request, locals)
  if (!isAuthed(auth)) return auth
  const db = createAstroAdminClient(locals.runtime?.env) as any
  const { data: profile, error } = await db.from('profiles').select('role,active').eq('user_id', auth.user.id).maybeSingle()
  const trustedAppRole = auth.user.app_metadata?.role === 'admin'
  if (error || !((profile?.active === true && profile.role === 'admin') || trustedAppRole)) {
    return new Response(JSON.stringify({ success:false, error:'forbidden' }), { status:403, headers:{'content-type':'application/json'} })
  }
  return { user: { id: auth.user.id } }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireSwitchAdmin(request, locals)
  if (auth instanceof Response) return auth
  const db = createAstroAdminClient(locals.runtime?.env) as any
  const { data, error } = await db.from('platform_operational_switches').select('*').eq('id','global').maybeSingle()
  if (error) return internalError('payment_switches_unavailable')
  return jsonOk(data ?? { jordan_qr_payments_enabled:true, pharmacy_express_payments_enabled:true, global_pix_mp_payments_enabled:true, whatsapp_send_enabled:false, email_send_enabled:false, dry_run_enabled:true, updated_by:null, updated_at:null, switch_audit:{} })
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ['admin', 'platform_admin'], locals)
  if (!isAuthed(auth)) return auth
  const body = await request.json().catch(() => null) as { key?:string; enabled?:boolean; reason?:string } | null
  if (!body || !ALLOWED.includes(body.key as SwitchName) || typeof body.enabled !== 'boolean') return badRequest('invalid_payment_switch')
  const db = createAstroAdminClient(locals.runtime?.env) as any
  const changedAt = new Date().toISOString()
  const { data: current, error: readError } = await db.from('platform_operational_switches')
    .select('switch_audit').eq('id','global').maybeSingle()
  if (readError || !current) return internalError('payment_switches_unavailable')
  const switchAudit = { ...(current.switch_audit ?? {}), [body.key]: {
    updated_by: auth.user.id, updated_at: changedAt,
    reason: typeof body.reason === 'string' ? body.reason.slice(0,500) : null,
  } }
  const { data, error } = await db.from('platform_operational_switches').update({
    [body.key as SwitchName]:body.enabled, updated_by:auth.user.id,
    reason: typeof body.reason === 'string' ? body.reason.slice(0,500) : null,
    updated_at:changedAt, switch_audit:switchAudit,
  }).eq('id','global').select('*').single()
  if (error) return internalError('payment_switch_update_failed')
  await db.from('audit_logs').insert({user_id:auth.user.id,action:'platform_operational_switch_updated',resource_type:'platform_operational_switches',metadata:{key:body.key,enabled:body.enabled,reason:body.reason ?? null}})
  return jsonOk(data)
}
