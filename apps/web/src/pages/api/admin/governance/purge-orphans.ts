import type { APIRoute } from 'astro';
import { ADMIN_ROLES,isAuthed,withAuthRole } from '@/lib/api-auth';
import { badRequest,internalError,jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
export const prerender=false;
export const POST:APIRoute=async({request,locals})=>{
 const auth=await withAuthRole(request,ADMIN_ROLES,locals);if(!isAuthed(auth))return auth;
 const body=await request.json().catch(()=>null) as {reason?:string}|null;const reason=typeof body?.reason==='string'?body.reason.trim():'';
 if(reason.length<8||reason.length>500)return badRequest('audit_reason_required');
 const db=createAstroAdminClient(locals.runtime?.env) as any;const {data,error}=await db.rpc('admin_purge_orphan_dispatch_requests',{p_actor_id:auth.user.id,p_reason:reason});
 if(error)return internalError('dispatch_orphan_purge_failed');return jsonOk(data);
};
