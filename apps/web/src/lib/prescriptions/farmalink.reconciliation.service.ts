import type { SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeEnvValue } from '@/lib/runtime-env';
import { FarmalinkClient, resolveFarmalinkConfig } from './farmalink.client';
import type { FarmalinkAltaRecetaRequest, FarmalinkClientConfig } from './farmalink.types';
import { buildFarmalinkConsultaRecetaRequest } from './farmalink.mapper';
import { sha256FarmalinkEvidence } from './farmalink.recovery.service';

type Obj = Record<string,unknown>;
function object(v:unknown):Obj|null { return v && typeof v==='object' && !Array.isArray(v) ? v as Obj : null; }
function canonical(v:unknown):string {
  if (Array.isArray(v)) return JSON.stringify(v.map(x=>JSON.parse(canonical(x))));
  const o=object(v);
  return o ? JSON.stringify(Object.fromEntries(Object.keys(o).sort().map(k=>[k,JSON.parse(canonical(o[k]))]))) : JSON.stringify(v ?? null);
}

/** Conservative supported shape. Missing fields, unreviewed shapes and non-00 responses stay blocked. */
export function matchesFarmalinkConsulta(raw:unknown, request:FarmalinkAltaRecetaRequest, vendorId:string):boolean {
  const root=object(object(raw)?.consultaRecetaElectRs);
  const response=object(root?.respuesta);
  const remote=object(root?.recElectronica);
  if (!['00','0'].includes(String(response?.codigo)) || !remote || String(remote.nroRecElectronica)!==vendorId
    || remote.estado !== 'VIGENTE' || !root || Object.keys(root).some(k=>!['respuesta','recElectronica'].includes(k))) return false;
  const expected=request.altaRecetaElectRq.recElectronica;
  // Until a real supplier response validates this revision, the service below is disabled.
  // Reject additional fields as well: they may encode cancellation/dispensing state.
  const {nroRecElectronica:_number,estado:_state,...projection}=remote;
  return canonical(projection)===canonical(expected);

}

export async function reconcileFarmalinkPrescription(
 db:SupabaseClient,actorUserId:string,input:{prescriptionId:string;vendorId:string;evidenceSha256:string;providerReference:string},
):Promise<{ok:true}|{ok:false;error:string}> {
 try {
  if (!/^[0-9]{1,32}$/.test(input.vendorId) || !/^[0-9a-f]{64}$/.test(input.evidenceSha256)
   || input.providerReference.trim().length<3 || input.providerReference.length>250) return {ok:false,error:'invalid_reconciliation_evidence'};
  const {data,error}=await db.rpc('get_farmalink_reconciliation_context',{p_prescription_id:input.prescriptionId,p_actor_user_id:actorUserId});
  if (error || !data?.snapshot?.request) return {ok:false,error:'farmalink_not_reconcilable'};
  if (getRuntimeEnvValue('FARMALINK_CONSULTA_SCHEMA_REVISION') !== 'consulta-v3-estado-vigente-1') {
    return {ok:false,error:'farmalink_consulta_contract_unverified'};
  }
  const config=resolveFarmalinkConfig();
  if (config.missing.length || config.baseUrl!==data.snapshot.providerBaseUrl) return {ok:false,error:'farmalink_reconciliation_environment_mismatch'};
  const request=data.snapshot.request as FarmalinkAltaRecetaRequest;
  const alta=request.altaRecetaElectRq;
  if (!alta?.infoCabeceraRq || !alta.recElectronica?.afiliado?.credencial) return {ok:false,error:'farmalink_reconciliation_snapshot_invalid'};
  const client=new FarmalinkClient(config as FarmalinkClientConfig);
  // This service never invokes altaReceta or bajaReceta, including on network errors.
  const raw=await client.consultaReceta(buildFarmalinkConsultaRecetaRequest({
   idOrganizacion:alta.infoCabeceraRq.idOrganizacion,tipoOrganizacion:alta.infoCabeceraRq.tipoOrganizacion,
   codEntidad:alta.recElectronica.afiliado.credencial.codEntidad,pan:alta.recElectronica.afiliado.credencial.pan,nroRecElectronica:input.vendorId,
  }));
  if (!matchesFarmalinkConsulta(raw,request,input.vendorId)) return {ok:false,error:'farmalink_consulta_not_matching_or_unsupported'};
  const responseBody=canonical(raw);
  if (new TextEncoder().encode(responseBody).byteLength>131072) return {ok:false,error:'farmalink_evidence_too_large'};
  const responseHash=await sha256FarmalinkEvidence(new TextEncoder().encode(responseBody));
  const saved=await db.rpc('reconcile_farmalink_issue',{
   p_prescription_id:input.prescriptionId,p_attempt_id:data.attempt_id,p_actor_user_id:actorUserId,p_vendor_id:input.vendorId,
   p_request_sha256:data.request_sha256,p_evidence_sha256:input.evidenceSha256,p_response_sha256:responseHash,
   p_provider_reference:input.providerReference.trim(),p_response_body:responseBody,
  });
  return !saved.error && saved.data===true ? {ok:true} : {ok:false,error:'farmalink_reconciliation_conflict'};
 } catch { return {ok:false,error:'farmalink_reconciliation_unavailable'}; }
}
