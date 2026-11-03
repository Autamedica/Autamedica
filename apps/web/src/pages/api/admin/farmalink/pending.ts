import type { APIRoute } from 'astro';
import { withAuthRole, isAuthed } from '@/lib/api-auth';
import { internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { listPendingFarmalink } from '@/lib/prescriptions/farmalink.reconciliation.service';

export const GET:APIRoute=async ({request,locals})=>{
 try {
  const auth=await withAuthRole(request,['platform_admin','admin'],locals);
  if (!isAuthed(auth)) return auth;
  const result=await listPendingFarmalink(createAstroAdminClient(locals.runtime?.env),auth.user.id);
  return result.ok===true ? jsonOk(result.data) : internalError(result.error);
 } catch { return internalError('farmalink_pending_unavailable'); }
};
