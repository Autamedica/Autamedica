import type { APIRoute } from 'astro';
import { withAuthRole, isAuthed } from '@/lib/api-auth';
import { badRequest, conflict, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { reconcileFarmalinkPrescription } from '@/lib/prescriptions/farmalink.reconciliation.service';

export const POST:APIRoute = async ({request,locals}) => {
 try {
  const auth=await withAuthRole(request,['platform_admin','admin'],locals);
  if (!isAuthed(auth)) return auth;
  const body=await request.json() as Record<string,unknown>;
  if (!body || typeof body.prescriptionId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.prescriptionId)
   || typeof body.vendorId!=='string' || typeof body.evidenceSha256!=='string' || typeof body.providerReference!=='string') {
    return badRequest('invalid_reconciliation_request');
  }
  const result=await reconcileFarmalinkPrescription(createAstroAdminClient(locals.runtime?.env),auth.user.id,{
   prescriptionId:body.prescriptionId,vendorId:body.vendorId,evidenceSha256:body.evidenceSha256,providerReference:body.providerReference,
  });
  return result.ok===true ? jsonOk({reconciled:true}) : conflict(result.error);
 } catch { return internalError('farmalink_reconciliation_failed'); }
};
