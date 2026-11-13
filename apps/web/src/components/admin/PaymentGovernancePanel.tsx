import { useEffect, useState } from 'react'

type Switches = {
 jordan_qr_payments_enabled:boolean
 pharmacy_express_payments_enabled:boolean
 global_pix_mp_payments_enabled:boolean
 whatsapp_send_enabled:boolean
 email_send_enabled:boolean
 dry_run_enabled:boolean
 updated_by:string|null
 updated_at:string|null
}
type PharmacyPayment = {id:string;request_id:string;amount_minor:number;currency:string;status:string;provider:string;assigned_doctor_id:string|null;jordan_commission_minor:number|null;created_at:string}
type Approval = { id:string; status:string; domain:string; proposed_by:string; summary:string; risk_reason:string; impact_scope:string; created_at:string }
type SwitchKey = Exclude<keyof Switches,'updated_by'|'updated_at'>
const SWITCHES: {key:SwitchKey;label:string;description:string;flows:string;inFlight:string}[] = [
 {key:'jordan_qr_payments_enabled',label:'Pagos QR Jordan',description:'Autoriza nuevos checkouts QR y la creación de cobros Jordan.',flows:'Checkout QR Jordan y creación de pagos asociados a solicitudes de consulta.',inFlight:'Los pagos ya aprobados y las consultas asignadas continúan. No revierte pagos ni corta videollamadas.'},
 {key:'pharmacy_express_payments_enabled',label:'Pagos Farmacias Express',description:'Autoriza nuevos cobros del flujo Farmacia Express.',flows:'Inicio de cobro y checkout de Farmacia Express.',inFlight:'Los pagos aceptados por el PSP y las consultas ya asignadas continúan su ciclo normal.'},
 {key:'global_pix_mp_payments_enabled',label:'Pasarela Global PIX / MercadoPago',description:'Autoriza nuevas operaciones en las pasarelas integradas.',flows:'Creación de nuevas operaciones PIX y MercadoPago que consultan el control global.',inFlight:'No revierte operaciones confirmadas ni detiene conciliaciones de pagos ya aceptados.'},
 {key:'whatsapp_send_enabled',label:'Envío WhatsApp',description:'Controla los envíos salientes de WhatsApp de Growth y comunicaciones.',flows:'Growth Agent Worker y Newsletter Worker, incluidos los adaptadores WhatsApp configurados.',inFlight:'Detiene nuevos envíos en la siguiente comprobación. Los mensajes ya aceptados por el proveedor no se retiran.'},
 {key:'email_send_enabled',label:'Envío email',description:'Controla los envíos salientes de correo de Growth y Newsletter.',flows:'Newsletter Worker y adaptadores de correo Resend/Brevo.',inFlight:'No inicia nuevos envíos. Campañas y mensajes ya aceptados por el proveedor continúan.'},
 {key:'dry_run_enabled',label:'Dry run',description:'Simula las entregas y evita llamadas a proveedores externos.',flows:'Modo de ejecución de los workers Growth y Newsletter.',inFlight:'Los trabajos ya procesados no se revierten. El modo se vuelve a consultar antes de cada nueva entrega.'},
]
export function PaymentGovernancePanel(){
 const [switches,setSwitches]=useState<Switches|null>(null)
 const [approvals,setApprovals]=useState<Approval[]>([])
 const [pharmacyPayments,setPharmacyPayments]=useState<PharmacyPayment[]>([])
 const [error,setError]=useState('')
 const load=async()=>{
  try{
   const [s,a,p]=await Promise.all([fetch('/api/admin/payments/toggle').then(r=>r.json()),fetch('/api/admin/approvals?status=pending').then(r=>r.json()),fetch('/api/admin/finance/pharmacy-payments').then(r=>r.json())])
   if(s.success)setSwitches(s.data)
   if(a.success)setApprovals(a.data)
   if(p.success)setPharmacyPayments(p.data)
   setError('')
  }catch{setError('No se pudo cargar la gobernanza administrativa')}
 }
 useEffect(()=>{void load()},[])
 const toggle=async(key:SwitchKey,enabled:boolean)=>{
  const r=await fetch('/api/admin/payments/toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,enabled,reason:'Cambio manual desde Admin'})})
  const j=await r.json(); if(!r.ok||!j.success){setError('No se pudo actualizar el interruptor');return}
  setSwitches(j.data)
 }
 const decide=async(id:string,decision:'APPROVED'|'REJECTED')=>{
  const r=await fetch('/api/admin/approvals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,decision})})
  const j=await r.json(); if(!r.ok||!j.success){setError('No se pudo registrar la decisión');return}
  await load()
 }
 return <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-5">
  <div><h2 className="text-lg font-semibold text-slate-900">Control de Cobros y Operaciones en Vivo</h2><p className="text-sm text-slate-500">Estado central en Supabase. Cada cambio registra actor, fecha y motivo.</p></div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <div className="grid gap-3 md:grid-cols-2">
   {SWITCHES.map(item=><article key={item.key} className="rounded-lg border p-4">
    <label className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{item.label}</span><input type="checkbox" checked={switches?.[item.key]??false} disabled={!switches} onChange={e=>void toggle(item.key,e.target.checked)} className="h-5 w-5"/></label>
    <p className="mt-2 text-sm text-slate-600">{item.description}</p>
    <p className="mt-2 text-xs text-slate-500"><strong>Endpoints y flujos:</strong> {item.flows}</p>
    <p className="mt-1 text-xs text-slate-500"><strong>Operaciones en curso:</strong> {item.inFlight}</p>
    <p className="mt-2 text-xs text-slate-500"><strong>Último cambio:</strong> {switches?.updated_by??'Sin registro'} · {switches?.updated_at?new Date(switches.updated_at).toLocaleString():'Sin fecha'}</p>
   </article>)}
  </div>
  <div><h2 className="text-lg font-semibold text-slate-900">Bandeja de Autorizaciones</h2>
   {approvals.length===0?<p className="mt-2 text-sm text-slate-500">No hay decisiones pendientes.</p>:<div className="mt-3 space-y-3">{approvals.map(a=><article key={a.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{a.summary}</strong><span className="text-xs uppercase text-amber-700">{a.domain}</span></div><p className="mt-1 text-sm text-slate-600">{a.risk_reason}</p><p className="text-xs text-slate-500">Propuesto por {a.proposed_by} · Impacto: {a.impact_scope}</p><div className="mt-3 flex gap-2"><button onClick={()=>void decide(a.id,'APPROVED')} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Autorizar</button><button onClick={()=>void decide(a.id,'REJECTED')} className="rounded bg-rose-700 px-3 py-2 text-sm text-white">Desautorizar / Rechazar</button></div></article>)}</div>}
  </div>
  <div><h2 className="text-lg font-semibold text-slate-900">Cobros de Farmacia Express / Jordan</h2>
   <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Estado</th><th className="p-2">Monto</th><th className="p-2">Comisión Jordan</th><th className="p-2">Request ID</th><th className="p-2">Médico asignado</th><th className="p-2">Fecha</th></tr></thead><tbody>
    {pharmacyPayments.map(p=><tr key={p.id} className="border-b"><td className="p-2">{p.status}</td><td className="p-2">{new Intl.NumberFormat(p.currency==='BRL'?'pt-BR':'es-AR',{style:'currency',currency:p.currency}).format(p.amount_minor/100)}</td><td className="p-2">{p.jordan_commission_minor===null?'—':new Intl.NumberFormat(p.currency==='BRL'?'pt-BR':'es-AR',{style:'currency',currency:p.currency}).format(p.jordan_commission_minor/100)}</td><td className="p-2 font-mono text-xs">{p.request_id}</td><td className="p-2">{p.assigned_doctor_id??'Sin asignar'}</td><td className="p-2">{new Date(p.created_at).toLocaleString()}</td></tr>)}
    {pharmacyPayments.length===0&&<tr><td colSpan={6} className="p-3 text-slate-500">Sin pagos de farmacia registrados.</td></tr>}
   </tbody></table></div>
  </div>
 </section>
}
