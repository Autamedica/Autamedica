import type { APIRoute } from 'astro'
import { withAuthRole, ADMIN_ROLES, isAuthed } from '@/lib/api-auth'
import { internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false
export const GET: APIRoute = async ({request,locals}) => {
 const auth=await withAuthRole(request,ADMIN_ROLES,locals)
 if(!isAuthed(auth)) return auth
 const db=createAstroAdminClient(locals.runtime?.env) as any
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
 return jsonOk((payments??[]).map((p:any)=>{
  const req=byId.get(p.dispatch_request_id)
  const doctor=req?.assigned_doctor_id?doctorById.get(req.assigned_doctor_id):null
  const doctorFeeMinor=req?.doctor_fee_brl?Math.round(Number(req.doctor_fee_brl)*100):null
  return {...p,request_id:p.dispatch_request_id,assigned_doctor_id:req?.assigned_doctor_id??null,
   doctor_user_id:doctor?.user_id??null,doctor_fee_minor:doctorFeeMinor,
   jordan_commission_minor:doctorFeeMinor===null?null:Math.max(0,p.amount_minor-doctorFeeMinor)}
 }))
}
