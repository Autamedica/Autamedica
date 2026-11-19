import type { APIRoute } from 'astro';
import { ADMIN_ROLES,isAuthed,withAuthRole } from '@/lib/api-auth';
import { badRequest,internalError,jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
export const prerender=false;
const DOMAINS=['operational_status','clinical_status','financial_status','commercial_status'] as const;
const VALID:Record<string,string[]>={operational_status:['healthy','degraded','outage','maintenance'],clinical_status:['ready','degraded','pending_issuance','unavailable'],financial_status:['ready','degraded','pending_reconciliation','unavailable'],commercial_status:['enabled','limited','paused','disabled']};
export const POST:APIRoute=async({request,locals})=>{
 const auth=await withAuthRole(request,ADMIN_ROLES,locals);if(!isAuthed(auth))return auth;
 const body=await request.json().catch(()=>null) as {scope_key?:string;domain?:string;status?:string;reason?:string}|null;const reason=typeof body?.reason==='string'?body.reason.trim():'';
 if(!body||!['GLOBAL','BR','AR','JORDAN','EXPRESS'].includes(body.scope_key??'')||!DOMAINS.includes(body.domain as typeof DOMAINS[number])||!VALID[body.domain??'']?.includes(body.status??'')||reason.length<8||reason.length>500)return badRequest('valid_scope_domain_status_and_audit_reason_required');
 const db=createAstroAdminClient(locals.runtime?.env) as any;const {data,error}=await db.rpc('admin_set_operational_domain_status',{p_scope_key:body.scope_key,p_domain:body.domain,p_status:body.status,p_reason:reason,p_actor_id:auth.user.id});
 if(error)return internalError('governance_status_update_failed');return jsonOk(data);
};
