import type { APIRoute } from 'astro';
import { withAuthRole, isAuthed } from '@/lib/api-auth';
import { internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';

export const GET:APIRoute=async ({request,locals})=>{
 try {
  const auth=await withAuthRole(request,['platform_admin','admin'],locals);
  if (!isAuthed(auth)) return auth;
  const {data,error}=await createAstroAdminClient(locals.runtime?.env).rpc('list_farmalink_pending',{p_actor_user_id:auth.user.id,p_limit:100});
  return error ? internalError('farmalink_pending_unavailable') : jsonOk(data);
 } catch { return internalError('farmalink_pending_unavailable'); }
};
