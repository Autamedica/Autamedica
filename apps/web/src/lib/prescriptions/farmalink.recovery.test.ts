import {afterEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {regenerateIssuedPrescriptionPdf} from './issue-prescription.service';
import {FarmalinkClient} from './farmalink.client';
import * as pdf from './pdf-prescription.service';
import * as certificates from '../doctors/services/certificate-query.service';
import {parseFarmalinkSnapshot,recoverFarmalinkPrescription,type FarmalinkSnapshot} from './farmalink.recovery.service';

const rx='bdbfd64b-4280-41b6-bb8c-630b09a0b9a5';
const actor='cac6f6b3-dc8a-4f4f-8833-45207e063f65';
const attempt='55bb9df3-e203-42a7-bef4-8a0f9cfb53e2';
const cuir='02680042020102000000000000000000000010101';
const snapshot:FarmalinkSnapshot={version:1,prescriptionId:rx,actorUserId:actor,doctorId:'doctor',clinicalData:{},request:{fixture:true},dispensationOrder:{},
 pdfInput:{prescriptionId:rx,existingCuir:cuir,issuedAt:'2026-11-03T09:00:00Z',expiresAt:'2026-12-03T09:00:00Z',diagnosis:'Control',
 medication:{genericName:'AMOXICILINA',quantity:1,dosage:'500mg',presentation:'Comprimidos',instructions:'Fixture'},
 patient:{name:'Paciente Fixture',dni:'30123456'},prescriber:{name:'Medico Fixture',license:'1234567'}}};
function db(receipt:unknown,error:unknown=null){
 const rpc=vi.fn().mockResolvedValueOnce({data:receipt,error}).mockResolvedValue({data:{artifact_path:'canonical.pdf',cuir,vendor_id:'9600000002992',issued_at:snapshot.pdfInput.issuedAt,expires_at:snapshot.pdfInput.expiresAt},error:null});
 const upload=vi.fn().mockResolvedValue({error:null});
 const signed=vi.fn().mockResolvedValue({data:{signedUrl:'https://example.invalid/pdf'},error:null});
 const storage={from:vi.fn().mockReturnValue({upload,createSignedUrl:signed})};
 return {client:{rpc,storage} as unknown as SupabaseClient,rpc,upload,signed};
}
describe('Farmalink receipt recovery without another alta',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('rejects missing/invalid snapshots and different actors',()=>{
  expect(parseFarmalinkSnapshot(null,rx,actor)).toBeNull();
  expect(parseFarmalinkSnapshot(snapshot,rx,'other')).toBeNull();
  expect(parseFarmalinkSnapshot({...snapshot,pdfInput:{...snapshot.pdfInput,expiresAt:'2025-01-01'}},rx,actor)).toBeNull();
 });
 it('rebuilds from the retained CUIR and original dates and atomically commits',async()=>{
  const d=db({attempt_id:attempt,vendor_id:'9600000002992',response_code:'00',snapshot,artifact_path:null});
  const alta=vi.spyOn(FarmalinkClient.prototype,'altaReceta');
  const render=vi.spyOn(pdf,'generatePrescriptionPdf').mockResolvedValue({cuir,pdfBuffer:new Uint8Array(4),pdfFilename:'fixture.pdf',qrDataUrl:'',qrContent:'fixture'});
  vi.spyOn(certificates,'getActiveCertificate').mockResolvedValue(null);
  const result=await recoverFarmalinkPrescription(d.client,rx,actor);
  expect(result).toMatchObject({ok:true,data:{cuir,issuedAt:snapshot.pdfInput.issuedAt,expiresAt:snapshot.pdfInput.expiresAt}});
  expect(render).toHaveBeenCalledWith(expect.objectContaining({existingCuir:cuir,issuedAt:snapshot.pdfInput.issuedAt,expiresAt:snapshot.pdfInput.expiresAt,externalPrescription:expect.objectContaining({number:'9600000002992'})}));
  expect(d.rpc.mock.calls[1]).toEqual(['complete_farmalink_artifact',expect.objectContaining({p_actor_user_id:actor,p_attempt_id:attempt,p_operation:'recovery'})]);
  expect(alta).not.toHaveBeenCalled();
 });
 it('reuses an existing committed artifact without rendering or sending',async()=>{
  const d=db({attempt_id:attempt,vendor_id:'9600000002992',response_code:'00',snapshot,artifact_path:'existing.pdf'});
  const render=vi.spyOn(pdf,'generatePrescriptionPdf');
  expect(await recoverFarmalinkPrescription(d.client,rx,actor)).toMatchObject({ok:true});
  expect(render).not.toHaveBeenCalled();expect(d.upload).not.toHaveBeenCalled();expect(d.rpc).toHaveBeenCalledTimes(1);
 });
 it.each([null,{state:'unknown'},{vendor_id:'9600000002992',response_code:'55',snapshot}])('does not recover an unconfirmed result',async receipt=>{
  const d=db(receipt);expect(await recoverFarmalinkPrescription(d.client,rx,actor)).toMatchObject({ok:false});expect(d.upload).not.toHaveBeenCalled();
 });
 it('keeps the confirmed receipt protected when upload fails',async()=>{
  const d=db({attempt_id:attempt,vendor_id:'9600000002992',response_code:'00',snapshot});
  d.upload.mockResolvedValue({error:{message:'unavailable'}});
  vi.spyOn(pdf,'generatePrescriptionPdf').mockResolvedValue({cuir,pdfBuffer:new Uint8Array(4),pdfFilename:'fixture.pdf',qrDataUrl:'',qrContent:'fixture'});
  vi.spyOn(certificates,'getActiveCertificate').mockResolvedValue(null);
  expect(await recoverFarmalinkPrescription(d.client,rx,actor)).toMatchObject({ok:false,error:'pdf_upload_failed'});
  expect(d.rpc).toHaveBeenCalledTimes(1);
 });
 it.each(['farmalink','autamedica_internal'])('protects legacy regeneration with provider label %s without renewal or overwrite',async vendorName=>{
  const d=db({attempt_id:attempt,vendor_id:'9600000002992',response_code:'00',snapshot,artifact_path:'original.pdf'});
  const doctor={id:'doctor',license_number:'1234567',refeps_id:'54123456789',professional_address:'CABA'};
  Object.assign(d.client,{from:vi.fn((table:string)=>{
   if(table==='doctors')return {select:()=>({eq:()=>({single:async()=>({data:doctor})})})};
   if(table==='prescriptions')return {select:()=>({limit:()=>({eq:async()=>({data:[{id:rx,doctor_id:'doctor',cuir,vendor_name:vendorName,vendor_id:'9600000002992'}]})})})};
   if(table==='farmalink_issue_attempts')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{prescription_id:rx},error:null})})})};
   throw new Error('Legacy generator must not query current clinical identities');
  })});
  const render=vi.spyOn(pdf,'generatePrescriptionPdf');
  expect(await regenerateIssuedPrescriptionPdf(d.client,rx,actor)).toMatchObject({ok:true,data:{issuedAt:snapshot.pdfInput.issuedAt,expiresAt:snapshot.pdfInput.expiresAt}});
  expect(render).not.toHaveBeenCalled();expect(d.upload).not.toHaveBeenCalled();
 });

 it('does not silently downgrade a failed certificate/signing lookup',async()=>{
  const d=db({attempt_id:attempt,vendor_id:'9600000002992',response_code:'00',snapshot});
  vi.spyOn(pdf,'generatePrescriptionPdf').mockResolvedValue({cuir,pdfBuffer:new Uint8Array(4),pdfFilename:'fixture.pdf',qrDataUrl:'',qrContent:'fixture'});
  vi.spyOn(certificates,'getActiveCertificate').mockRejectedValue(new Error('certificate unavailable'));
  expect(await recoverFarmalinkPrescription(d.client,rx,actor)).toMatchObject({ok:false,error:'farmalink_recovery_failed'});
  expect(d.upload).not.toHaveBeenCalled();
 });

 it('never uses another prescription signed URL as a writable internal regeneration path',async()=>{
  const d=db(null);const ownCuir='02680042020102000000000000000000000010102';
  const rows={id:rx,doctor_id:'doctor',patient_id:'patient',cuir:ownCuir,vendor_name:'autamedica_internal',vendor_id:'internal',
    signed_pdf_url:'https://example.invalid/object/sign/medical-documents/prescriptions/other-cuir/farmalink-protected.pdf?token=fixture',
    clinical_data:{items:[{generic_name:'AMOXICILINA',quantity:1,dosage:'500mg'}]}};
  Object.assign(d.client,{from:vi.fn((table:string)=>{
   if(table==='prescriptions')return {select:()=>({limit:()=>({eq:async()=>({data:[rows]})})}),update:()=>({eq:async()=>({error:null})})};
   if(table==='farmalink_issue_attempts')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})};
   if(table==='prescription_audit_events')return {insert:async()=>({error:null})};
   const value=table==='doctors'?{id:'doctor',license_number:'1234567',refeps_id:'54123456789',professional_address:'CABA'}:
     table==='patients'?{user_id:'patient-user',dni:'30123456',address:'CABA'}:{first_name:'Persona',last_name:'Fixture'};
   return {select:()=>({eq:()=>({single:async()=>({data:value})})})};
  })});
  vi.spyOn(pdf,'generatePrescriptionPdf').mockResolvedValue({cuir:ownCuir,pdfBuffer:new Uint8Array(4),pdfFilename:'fixture.pdf',qrDataUrl:'',qrContent:'fixture'});
  expect(await regenerateIssuedPrescriptionPdf(d.client,rx,actor)).toMatchObject({ok:true});
  const [path,,options]=d.upload.mock.calls[0];
  expect(path).toMatch(new RegExp(`^prescriptions/${ownCuir}/regenerated-${rx}-`));
  expect(path).not.toContain('farmalink-protected');expect(options).toMatchObject({upsert:false});
 });

});
