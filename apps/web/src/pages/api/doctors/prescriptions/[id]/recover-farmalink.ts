import type { APIRoute } from 'astro';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { badRequest, conflict, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { recoverFarmalinkPrescription } from '@/lib/prescriptions/farmalink.recovery.service';

export const POST: APIRoute = async ({request,params,locals}) => {
  try {
    const auth = await withAuthRole(request,DOCTOR_ROLES,locals);
    if (!isAuthed(auth)) return auth;
    if (!params.id || !/^[0-9a-f-]{36}$/i.test(params.id)) return badRequest('invalid_prescription_id');
    const result = await recoverFarmalinkPrescription(createAstroAdminClient(locals.runtime?.env),params.id,auth.user.id);
    if (result.ok === false) return conflict(result.error);
    return jsonOk(result.data);
  } catch { return internalError('farmalink_recovery_failed'); }
};
