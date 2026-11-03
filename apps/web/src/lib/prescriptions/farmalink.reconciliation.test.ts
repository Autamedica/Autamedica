import {afterEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {primeRuntimeEnv,resetRuntimeEnvCache} from '@/lib/runtime-env';
import {FarmalinkClient} from './farmalink.client';
import type {FarmalinkAltaRecetaRequest} from './farmalink.types';
import {matchesFarmalinkConsulta,reconcileFarmalinkPrescription} from './farmalink.reconciliation.service';
const request={altaRecetaElectRq:{infoCabeceraRq:{idOrganizacion:'100',tipoOrganizacion:'NMD',ipOrigen:'8.8.8.8'},recElectronica:{
 fechaVigenciaDesde:'2026-11-03',fechaVigenciaHasta:'2026-12-03',tipoTratamiento:'N',
 afiliado:{nombre:'Paciente',apellido:'Fixture',numeroDocumento:30123456,credencial:{codEntidad:7100,pan:'12345678',plan:'NO POSEE'}},
 medico:{nombre:'Medico',apellido:'Fixture',matricula:{numero:1234567}},detalleRecElectronica:{item:[{codProducto:'56800',codDroga:'01033',cantidad:1}]},
}}} as unknown as FarmalinkAltaRecetaRequest;
function reply(){return {consultaRecetaElectRs:{respuesta:{codigo:'00'},recElectronica:{...structuredClone(request.altaRecetaElectRq.recElectronica),nroRecElectronica:'9600000002992',estado:'VIGENTE'}}};}
function setup(){primeRuntimeEnv({FARMALINK_CONSULTA_SCHEMA_REVISION:'consulta-v3-estado-vigente-1',FARMALINK_OAUTH_USERNAME:'dummy',FARMALINK_OAUTH_PASSWORD:'dummy',FARMALINK_BASIC_USER:'dummy',FARMALINK_BASIC_PASSWORD:'dummy'});}
const input={prescriptionId:'bdbfd64b-4280-41b6-bb8c-630b09a0b9a5',vendorId:'9600000002992',evidenceSha256:'b'.repeat(64),providerReference:'SOL-3144/synthetic'};
function db(){const rpc=vi.fn().mockResolvedValueOnce({data:{attempt_id:'55bb9df3-e203-42a7-bef4-8a0f9cfb53e2',request_sha256:'a'.repeat(64),snapshot:{request,providerBaseUrl:'https://test-servicios.farmalink.com.ar'}},error:null}).mockResolvedValue({data:true,error:null});return {client:{rpc} as unknown as SupabaseClient,rpc};}
describe('Conservative Farmalink reconciliation - synthetic contract only',()=>{
 afterEach(()=>{vi.restoreAllMocks();resetRuntimeEnvCache();});
 it('requires matching identities, every medication, validity, number and active state',()=>{
  expect(matchesFarmalinkConsulta(reply(),request,input.vendorId)).toBe(true);
  const wrong=reply();wrong.consultaRecetaElectRs.recElectronica.afiliado.numeroDocumento=40000000;
  expect(matchesFarmalinkConsulta(wrong,request,input.vendorId)).toBe(false);
  const canceled=reply();canceled.consultaRecetaElectRs.recElectronica.estado='ANULADA';
  expect(matchesFarmalinkConsulta(canceled,request,input.vendorId)).toBe(false);
  expect(matchesFarmalinkConsulta(reply(),request,'123')).toBe(false);
 });
 it('rejects extra remote fields that could encode a conflicting lifecycle',()=>{
  const r=reply();Object.assign(r.consultaRecetaElectRs.recElectronica,{anulada:true});
  expect(matchesFarmalinkConsulta(r,request,input.vendorId)).toBe(false);
 });
 it('remains disabled until the supplier response revision is independently reviewed',async()=>{
  const d=db();const query=vi.spyOn(FarmalinkClient.prototype,'consultaReceta');
  expect(await reconcileFarmalinkPrescription(d.client,'admin',input)).toMatchObject({ok:false,error:'farmalink_consulta_contract_unverified'});
  expect(query).not.toHaveBeenCalled();expect(d.rpc).toHaveBeenCalledTimes(1);
 });
 it('queries once, retains evidence and never emits or cancels',async()=>{
  setup();const d=db();const query=vi.spyOn(FarmalinkClient.prototype,'consultaReceta').mockResolvedValue(reply());
  const alta=vi.spyOn(FarmalinkClient.prototype,'altaReceta');const baja=vi.spyOn(FarmalinkClient.prototype,'bajaReceta');
  expect(await reconcileFarmalinkPrescription(d.client,'admin',input)).toEqual({ok:true});
  expect(query).toHaveBeenCalledOnce();expect(alta).not.toHaveBeenCalled();expect(baja).not.toHaveBeenCalled();
  expect(d.rpc.mock.calls[1]).toEqual(['reconcile_farmalink_issue',expect.objectContaining({p_actor_user_id:'admin',p_vendor_id:input.vendorId,p_response_body:expect.any(String),p_response_sha256:expect.stringMatching(/^[0-9a-f]{64}$/)})]);
 });
 it('leaves a functional rejection or network failure unresolved',async()=>{
  setup();const d=db();vi.spyOn(FarmalinkClient.prototype,'consultaReceta').mockResolvedValue({consultaRecetaElectRs:{respuesta:{codigo:'33'}}});
  expect(await reconcileFarmalinkPrescription(d.client,'admin',input)).toMatchObject({ok:false});expect(d.rpc).toHaveBeenCalledTimes(1);
 });
 it.each(['medication','validity','credential'])('rejects a mismatching %s',field=>{
  const r=reply();const rx=r.consultaRecetaElectRs.recElectronica;
  if(field==='medication')rx.detalleRecElectronica.item[0].cantidad=2;
  if(field==='validity')rx.fechaVigenciaHasta='2027-01-01';
  if(field==='credential')rx.afiliado.credencial.pan='87654321';
  expect(matchesFarmalinkConsulta(r,request,input.vendorId)).toBe(false);
 });

});
