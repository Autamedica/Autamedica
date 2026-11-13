import type { APIRoute } from 'astro'
import { withAuthRole, ADMIN_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false
export const GET: APIRoute = async ({ request, locals }) => {
 const auth=await withAuthRole(request,ADMIN_ROLES,locals)
 if(!isAuthed(auth)) return auth
 const status=new URL(request.url).searchParams.get('status')
 const db=createAstroAdminClient(locals.runtime?.env) as any
 let query=db.from('admin_approval_decisions').select('*').order('created_at',{ascending:false}).limit(200)
 if(status==='pending') query=query.eq('status','PENDING_HUMAN_APPROVAL')
 const {data,error}=await query
 if(error) return internalError('approval_inbox_unavailable')
 return jsonOk(data ?? [])
}
export const POST: APIRoute = async ({ request, locals }) => {
 const auth=await withAuthRole(request,ADMIN_ROLES,locals)
 if(!isAuthed(auth)) return auth
 const body=await request.json().catch(()=>null) as {id?:string;decision?:string;notes?:string}|null
 if(!body?.id || !['APPROVED','REJECTED'].includes(body.decision ?? '')) return badRequest('invalid_approval_decision')
 const db=createAstroAdminClient(locals.runtime?.env) as any
 const {data,error}=await db.from('admin_approval_decisions').update({
  status:body.decision, reviewed_by:auth.user.id, reviewed_at:new Date().toISOString(),
  review_notes:typeof body.notes==='string'?body.notes.slice(0,2000):null, updated_at:new Date().toISOString(),
 }).eq('id',body.id).eq('status','PENDING_HUMAN_APPROVAL').select('*').maybeSingle()
 if(error) return internalError('approval_decision_update_failed')
 if(!data) return badRequest('approval_already_reviewed_or_not_found')
 await db.from('audit_logs').insert({user_id:auth.user.id,action:'admin_approval_decision_reviewed',resource_type:'admin_approval_decisions',resource_id:data.id,metadata:{decision:body.decision,notes:body.notes ?? null,domain:data.domain}})
 return jsonOk(data)
}
