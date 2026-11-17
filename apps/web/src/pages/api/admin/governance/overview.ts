import type { APIRoute } from 'astro';
import { ADMIN_ROLES,isAuthed,withAuthRole } from '@/lib/api-auth';
import { internalError,jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
export const prerender=false;
export const GET:APIRoute=async({request,locals})=>{
 const auth=await withAuthRole(request,ADMIN_ROLES,locals);if(!isAuthed(auth))return auth;
 const db=createAstroAdminClient(locals.runtime?.env) as any;
 const [scopes,dres,pres,lres,sres,dutyres,presenceres,qres,patres,cres,mres,eres,logs,brActive,arActive,brTotal,arTotal]=await Promise.all([
  db.from('platform_operational_domains').select('*').order('scope_key'),
  db.from('doctors').select('id,user_id,license_number,license_type,uf_brazil,care_country,active,on_duty_pharmacy,on_duty_since,created_at').order('created_at',{ascending:false}).limit(300),
  db.from('profiles').select('user_id,first_name,last_name,email,fcm_token').eq('role','doctor').limit(500),
  db.from('doctor_licenses').select('id,doctor_id,license_number,license_type,province,uf_brazil,status,cfm_validation_status,cfm_last_checked_at,cfm_evidence_path,cfm_review_notes,cfm_reviewed_by,cfm_reviewed_at').order('created_at',{ascending:false}).limit(500),
  // Legacy session rows are retained as a compatibility fallback only.
  db.from('doctor_on_duty_sessions').select('doctor_id,status,last_heartbeat_at').order('last_heartbeat_at',{ascending:false}).limit(500),
  // doctor_duty_status is the canonical source used by the current heartbeat RPC.
  db.from('doctor_duty_status').select('doctor_id,is_on_duty,last_heartbeat_at,current_active_request_id').order('last_heartbeat_at',{ascending:false}).limit(500),
  db.from('doctor_presence').select('doctor_id,last_seen_at').order('last_seen_at',{ascending:false}).limit(1000),
  db.from('pharmacy_dispatch_requests').select('id,status,care_country,assigned_doctor_id,search_timeout_at,created_at,referral_partner_id').in('status',['searching','matched','in_call']).order('created_at',{ascending:false}).limit(200),
  db.from('patients').select('id,care_country,lgpd_consent,lgpd_consent_version').limit(1000),
  db.from('informed_consents').select('id,patient_id,consent_type,template_version,signed_at,revoked_at,revoked_reason,expires_at').order('created_at',{ascending:false}).limit(500),
  db.from('medical_certificates').select('id,country_code,status,signed_pdf_url,signature_verified_at,signature_hash,signature_method,created_at').order('created_at',{ascending:false}).limit(300),
  db.from('doctor_earnings').select('id,doctor_id,dispatch_request_id,gross_amount,net_amount,currency,status,paid_at,created_at').order('created_at',{ascending:false}).limit(300),
  db.from('audit_logs').select('id,action,resource_type,metadata,created_at').or('action.ilike.%memed%,action.ilike.%prescription%,action.ilike.%certificate%,resource_type.ilike.%prescription%,resource_type.ilike.%certificate%').order('created_at',{ascending:false}).limit(100),
  db.from('patients').select('id',{count:'exact',head:true}).eq('care_country','BR').eq('lgpd_consent',true),
  db.from('patients').select('id',{count:'exact',head:true}).eq('care_country','AR').eq('lgpd_consent',true),
  db.from('patients').select('id',{count:'exact',head:true}).eq('care_country','BR'),
  db.from('patients').select('id',{count:'exact',head:true}).eq('care_country','AR')
 ]);
 if([scopes,dres,pres,lres,sres,dutyres,presenceres,qres,patres,cres,mres,eres,logs,brActive,arActive,brTotal,arTotal].some(x=>x.error))return internalError('governance_overview_unavailable');
 const profileMap=new Map((pres.data??[]).map((p:any)=>[p.user_id,p]));
 const sessionMap=new Map((sres.data??[]).map((s:any)=>[s.doctor_id,s]));
 const dutyMap=new Map((dutyres.data??[]).map((s:any)=>[s.doctor_id,s]));
 const presenceMap=new Map((presenceres.data??[]).map((s:any)=>[s.doctor_id,s]));
 const presenceCutoff=Date.now()-90000;
 const onlineDoctorsCount=(presenceres.data??[]).filter((s:any)=>s.last_seen_at&&new Date(s.last_seen_at).getTime()>presenceCutoff).length;
 const doctors=(dres.data??[]).map((d:any)=>{
  const p:any=profileMap.get(d.user_id);
  const duty:any=dutyMap.get(d.id)??null;
  const session:any=sessionMap.get(d.id)??null;
  const presence:any=presenceMap.get(d.id)??null;
  const presenceLastSeenAt=presence?.last_seen_at??null;
  const isOnline=presenceLastSeenAt?new Date(presenceLastSeenAt).getTime()>presenceCutoff:false;
  // Prefer canonical duty heartbeat; fall back to the legacy session for old rows.
  const heartbeatAt=duty?.last_heartbeat_at??session?.last_heartbeat_at??null;
  const heartbeatFresh=heartbeatAt?new Date(heartbeatAt).getTime()>Date.now()-180000:false;
  const isOnDuty=duty?.is_on_duty===true||(duty===null&&(d.on_duty_pharmacy===true||(session?.status==='active'&&heartbeatFresh)));
  return {...d,display_name:[p?.first_name,p?.last_name].filter(Boolean).join(' ').trim()||p?.email||d.id,email:p?.email??null,fcm_token_active:Boolean(p?.fcm_token),on_duty:isOnDuty,last_heartbeat_at:heartbeatAt,is_online:isOnline,presence_last_seen_at:presenceLastSeenAt,licenses:(lres.data??[]).filter((l:any)=>l.doctor_id===d.id)};
 });
 const patients=patres.data??[],patientMap=new Map(patients.map((p:any)=>[p.id,p]));
 const consents=(cres.data??[]).map((c:any)=>{const p:any=patientMap.get(c.patient_id);return {id:c.id,patient_reference:String(c.patient_id??'').slice(-8),country_code:p?.care_country??null,consent_type:c.consent_type,template_version:c.template_version,signed_at:c.signed_at,revoked_at:c.revoked_at,revoked_reason:c.revoked_reason,expires_at:c.expires_at}});
 const certificates=(mres.data??[]).map((c:any)=>({id:c.id,country_code:c.country_code,status:c.status,pdf_available:Boolean(c.signed_pdf_url),signature_verified:Boolean(c.signature_verified_at&&c.signature_hash),signature_method:c.signature_method,created_at:c.created_at}));
 const clinicalEvents=(logs.data??[]).map((e:any)=>({id:e.id,action:e.action,resource_type:e.resource_type,created_at:e.created_at,provider:e.metadata?.provider??null,error_code:e.metadata?.error_code??e.metadata?.error??null,country_code:e.metadata?.country_code??null}));
 const versions=patients.filter((p:any)=>p.lgpd_consent===true).reduce((a:Record<string,number>,p:any)=>{const v=String(p.lgpd_consent_version??'sin versión');a[v]=(a[v]??0)+1;return a},{});
 return jsonOk({scopes:scopes.data??[],doctors,online_doctors_count:onlineDoctorsCount,consents,certificates,clinical_events:clinicalEvents,dispatches:qres.data??[],earnings:eres.data??[],consent_summary:{br_active:brActive.count??0,ar_active:arActive.count??0,br_total:brTotal.count??0,ar_total:arTotal.count??0,versions},generated_at:new Date().toISOString()});
};
