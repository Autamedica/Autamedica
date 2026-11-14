import type { APIRoute } from 'astro'
import { withAuthRole, ADMIN_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) => {
 const auth = await withAuthRole(request, ADMIN_ROLES, locals)
 if (!isAuthed(auth)) return auth
 const db = createAstroAdminClient(locals.runtime?.env) as any
 if (new URL(request.url).searchParams.get('view') === 'commissions') {
  const { data, error } = await db.from('commercial_referral_commissions')
   .select('id,dispatch_request_id,dispatch_payment_id,referral_partner_id,amount_minor,currency,status,eligible_at,reversed_at,payment_reference,paid_at')
   .order('created_at', { ascending: false }).limit(200)
  if (error) return internalError('pharmacy_commissions_unavailable')
  const partnerIds = [...new Set((data ?? []).map((row: any) => row.referral_partner_id).filter(Boolean))]
  const { data: partners } = partnerIds.length
   ? await db.from('commercial_referral_partners').select('id,display_name,code').in('id', partnerIds)
   : { data: [] }
  const partnerById = new Map<string, any>((partners ?? []).map((partner: any) => [partner.id, partner]))
  return jsonOk((data ?? []).map((row: any) => ({
   ...row,
   partner_name: partnerById.get(row.referral_partner_id)?.display_name ?? partnerById.get(row.referral_partner_id)?.code ?? 'Partner',
  })))
 }

 const {data:payments,error}=await db.from('pharmacy_dispatch_payments')
  .select('id,dispatch_request_id,amount_minor,currency,provider,status,provider_payment_id,paid_at,created_at')
  .order('created_at',{ascending:false}).limit(200)
 if(error) return internalError('pharmacy_payments_unavailable')
 const ids=(payments??[]).map((p:any)=>p.dispatch_request_id).filter(Boolean)
 const {data:requests}=ids.length?await db.from('pharmacy_dispatch_requests')
  .select('id,assigned_doctor_id,doctor_fee_brl,price_brl').in('id',ids):{data:[]}
 const byId=new Map<string, any>((requests??[]).map((r:any)=>[r.id,r]))
 const doctorIds=[...new Set((requests??[]).map((r:any)=>r.assigned_doctor_id).filter(Boolean))]
 const {data:doctors}=doctorIds.length?await db.from('doctors').select('id,user_id').in('id',doctorIds):{data:[]}
 const doctorById=new Map<string, any>((doctors??[]).map((d:any)=>[d.id,d]))
 const {data:commissionRows,error:commissionError}=ids.length?await db.from('commercial_referral_commissions')
  .select('dispatch_request_id,amount_minor,status').in('dispatch_request_id',ids):{data:[],error:null}
 if(commissionError) return internalError('pharmacy_commissions_unavailable')
 const commissionByDispatch=new Map<string, any>((commissionRows??[]).map((row:any)=>[row.dispatch_request_id,row]))
 return jsonOk((payments??[]).map((p:any)=>{
  const req=byId.get(p.dispatch_request_id)
  const doctor=req?.assigned_doctor_id?doctorById.get(req.assigned_doctor_id):null
  const doctorFeeMinor=req?.doctor_fee_brl?Math.round(Number(req.doctor_fee_brl)*100):null
  return {...p,request_id:p.dispatch_request_id,assigned_doctor_id:req?.assigned_doctor_id??null,
   doctor_user_id:doctor?.user_id??null,doctor_fee_minor:doctorFeeMinor,
   jordan_commission_minor:commissionByDispatch.get(p.dispatch_request_id)?.status==='eligible'||commissionByDispatch.get(p.dispatch_request_id)?.status==='paid'?commissionByDispatch.get(p.dispatch_request_id).amount_minor:0,
   commercial_commission_status:commissionByDispatch.get(p.dispatch_request_id)?.status??null}
 }))
}

export const POST: APIRoute = async ({ request, locals }) => {
 const auth = await withAuthRole(request, ADMIN_ROLES, locals)
 if (!isAuthed(auth)) return auth
 const body = await request.json().catch(() => null) as { commissionId?: string; paymentReference?: string } | null
 const commissionId = typeof body?.commissionId === 'string' ? body.commissionId.trim() : ''
 const paymentReference = typeof body?.paymentReference === 'string' ? body.paymentReference.trim() : ''
 if (!commissionId || !/^[0-9a-f-]{36}$/i.test(commissionId) || !paymentReference || paymentReference.length > 200) {
  return badRequest('commission_id_and_transfer_reference_required')
 }
 const db = createAstroAdminClient(locals.runtime?.env) as any
 const now = new Date().toISOString()
 const { data, error } = await db.from('commercial_referral_commissions')
  .update({ status: 'paid', payment_reference: paymentReference, paid_at: now, paid_by: auth.user.id })
  .eq('id', commissionId).eq('status', 'eligible')
  .select('id,status,payment_reference,paid_at,paid_by').maybeSingle()
 if (error) return internalError('pharmacy_commission_settlement_failed')
 if (!data) return badRequest('commission_not_eligible_or_already_settled')
 const { error: auditError } = await db.from('audit_logs').insert({
  user_id: auth.user.id,
  action: 'pharmacy_referral_commission_paid',
  resource_type: 'commercial_referral_commissions',
  resource_id: commissionId,
  metadata: { payment_reference: paymentReference },
 })
 if (auditError) return internalError('pharmacy_commission_audit_failed')
 return jsonOk(data)
}
