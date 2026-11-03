import type { SupabaseClient } from '@supabase/supabase-js';
import { generatePrescriptionPdf, type PrescriptionPdfInput } from './pdf-prescription.service';
import type { IssuanceResult } from './issue-prescription.service';
import { getActiveCertificate, loadSigningCredentials } from '../doctors/services/certificate-query.service';

export type RecoveryResult = {ok:true;data:IssuanceResult} | {ok:false;error:string};
export interface FarmalinkSnapshot {
  version: 1;
  prescriptionId: string;
  actorUserId: string;
  doctorId: string;
  clinicalData: unknown;
  request: unknown;
  pdfInput: PrescriptionPdfInput;
  dispensationOrder: Record<string, unknown>;
}

export function parseFarmalinkSnapshot(value: unknown, prescriptionId: string, actorUserId: string): FarmalinkSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as FarmalinkSnapshot;
  const p = s.pdfInput;
  if (s.version !== 1 || s.prescriptionId !== prescriptionId || s.actorUserId !== actorUserId
    || !s.doctorId || !p || p.prescriptionId !== prescriptionId || !/^[0-9]{41}$/.test(p.existingCuir ?? '')
    || !p.patient?.name || !p.patient.dni || !p.prescriber?.license || !p.medication?.genericName
    || !Number.isSafeInteger(p.medication.quantity) || p.medication.quantity <= 0
    || !Number.isFinite(Date.parse(p.issuedAt)) || !p.expiresAt || !Number.isFinite(Date.parse(p.expiresAt))
    || Date.parse(p.expiresAt) < Date.parse(p.issuedAt) || !s.dispensationOrder || !s.request) return null;
  return s;
}

export async function sha256FarmalinkEvidence(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Shared by original issue and recovery: one transaction commits prescription, order and audit. */
export async function commitFarmalinkArtifact(
  db: SupabaseClient,
  input: {prescriptionId:string;attemptId:string;actorUserId:string;path:string;hash:string;signatureMethod:string;signedUrl:string;operation:'initial'|'recovery'},
): Promise<RecoveryResult> {
  try {
    const {data,error} = await db.rpc('complete_farmalink_artifact', {
      p_prescription_id:input.prescriptionId,p_attempt_id:input.attemptId,p_actor_user_id:input.actorUserId,
      p_artifact_path:input.path,p_artifact_sha256:input.hash,p_signature_method:input.signatureMethod,
      p_signed_pdf_url:input.signedUrl,p_operation:input.operation,
    });
    if (error || !data?.artifact_path || !data?.cuir || !data?.vendor_id || !data?.issued_at || !data?.expires_at) {
      return {ok:false,error:'farmalink_artifact_commit_failed'};
    }
    const {data:url,error:urlError} = await db.storage.from('medical-documents').createSignedUrl(data.artifact_path, 365*24*60*60);
    if (urlError || !url?.signedUrl) return {ok:false,error:'farmalink_artifact_url_failed'};
    return {ok:true,data:{cuir:data.cuir,qrContent:`https://www.autamedica.com/verify/${data.cuir}`,
      signedPdfUrl:url.signedUrl,issuedAt:data.issued_at,expiresAt:data.expires_at,vendorName:'farmalink',vendorId:data.vendor_id}};
  } catch { return {ok:false,error:'farmalink_artifact_commit_failed'}; }
}

/** No Farmalink client import: recovery cannot issue, query or cancel an external prescription. */
export async function recoverFarmalinkPrescription(db:SupabaseClient, prescriptionId:string, actorUserId:string):Promise<RecoveryResult> {
  try {
    const {data,error} = await db.rpc('get_farmalink_recovery',{p_prescription_id:prescriptionId,p_actor_user_id:actorUserId});
    if (error || !data || !/^[0-9]{1,32}$/.test(data.vendor_id ?? '') || !['00','0'].includes(data.response_code)) {
      return {ok:false,error:'farmalink_recovery_not_confirmed'};
    }
    const snapshot = parseFarmalinkSnapshot(data.snapshot,prescriptionId,actorUserId);
    if (!snapshot) return {ok:false,error:'farmalink_recovery_snapshot_unavailable'};
    if (data.artifact_path) {
      const {data:url,error:urlError} = await db.storage.from('medical-documents').createSignedUrl(data.artifact_path,365*24*60*60);
      if (urlError || !url?.signedUrl) return {ok:false,error:'farmalink_artifact_url_failed'};
      return {ok:true,data:{cuir:snapshot.pdfInput.existingCuir!,qrContent:`https://www.autamedica.com/verify/${snapshot.pdfInput.existingCuir}`,
        signedPdfUrl:url.signedUrl,issuedAt:snapshot.pdfInput.issuedAt,expiresAt:snapshot.pdfInput.expiresAt!,vendorName:'farmalink',vendorId:data.vendor_id}};
    }
    const artifacts = await generatePrescriptionPdf({...snapshot.pdfInput,externalPrescription:{provider:'farmalink',number:data.vendor_id,
      displayLabel:'RECETA FARMALINK',legend:'Número de receta para validación online en farmacia'}});
    let bytes = artifacts.pdfBuffer;
    let method = 'electronic_simple';
    const cert = await getActiveCertificate(db,snapshot.doctorId);
    if (cert) {
      // If signing was available, do not silently downgrade a failed recovery to an unsigned PDF.
      const {p12Buffer,password} = await loadSigningCredentials(db,snapshot.doctorId,cert.certFingerprint);
      const {signPdfWithP12} = await import('./pdf-signer.service');
      const signed = await signPdfWithP12({pdfBuffer:bytes,p12Buffer,password,signerName:snapshot.pdfInput.prescriber.name,
        reason:`Receta ${artifacts.cuir}`,location:snapshot.pdfInput.prescriber.licenseJurisdiction ?? 'Argentina'});
      bytes = signed.signedPdfBuffer; method = 'ac_external';
    }
    const path = `prescriptions/${artifacts.cuir}/farmalink-${data.attempt_id}-${crypto.randomUUID()}.pdf`;
    const {error:uploadError} = await db.storage.from('medical-documents').upload(path,bytes,{contentType:'application/pdf',upsert:false});
    if (uploadError) return {ok:false,error:'pdf_upload_failed'};
    const {data:url,error:urlError} = await db.storage.from('medical-documents').createSignedUrl(path,365*24*60*60);
    if (urlError || !url?.signedUrl) return {ok:false,error:'farmalink_artifact_url_failed'};
    return commitFarmalinkArtifact(db,{prescriptionId,attemptId:data.attempt_id,actorUserId,path,
      hash:await sha256FarmalinkEvidence(bytes),signatureMethod:method,signedUrl:url.signedUrl,operation:'recovery'});
  } catch { return {ok:false,error:'farmalink_recovery_failed'}; }
}
