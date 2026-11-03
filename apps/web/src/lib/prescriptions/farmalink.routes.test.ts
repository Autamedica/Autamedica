import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),recover:vi.fn(),reconcile:vi.fn(),pending:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/api-auth',()=>({DOCTOR_ROLES:['doctor'],withAuthRole:m.auth,isAuthed:(a:unknown)=>!(a instanceof Response)}));
vi.mock('@/lib/supabase',()=>({createAstroAdminClient:m.client}));
vi.mock('@/lib/prescriptions/farmalink.recovery.service',()=>({recoverFarmalinkPrescription:m.recover}));
vi.mock('@/lib/prescriptions/farmalink.reconciliation.service',()=>({reconcileFarmalinkPrescription:m.reconcile,listPendingFarmalink:m.pending}));
import {POST as recover} from '../../pages/api/doctors/prescriptions/[id]/recover-farmalink';
import {POST as reconcile} from '../../pages/api/admin/farmalink/reconcile';
import {GET as pending} from '../../pages/api/admin/farmalink/pending';
const id='bdbfd64b-4280-41b6-bb8c-630b09a0b9a5';
function context(body:unknown={}){return {request:new Request('https://example.invalid/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),params:{id},locals:{}} as unknown as Parameters<typeof recover>[0];}
describe('Farmalink authenticated routes',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.client.mockReturnValue({});m.auth.mockResolvedValue({user:{id:'session-actor'}});m.recover.mockResolvedValue({ok:true,data:{cuir:'fixture'}});m.reconcile.mockResolvedValue({ok:true});m.pending.mockResolvedValue({ok:true,data:[]});});
 it.each([recover,reconcile,pending])('rejects unauthenticated requests before accessing the server client',async route=>{
  m.auth.mockResolvedValue(new Response(null,{status:401}));
  expect((await route(context())).status).toBe(401);expect(m.client).not.toHaveBeenCalled();
 });
 it('uses the session actor for recovery and ignores a body actor',async()=>{
  expect((await recover(context({actorUserId:'forged'}))).status).toBe(200);
  expect(m.recover).toHaveBeenCalledWith({},id,'session-actor');
 });
 it('restricts administrative reconciliation and takes the operator from session',async()=>{
  expect((await reconcile(context({prescriptionId:id,vendorId:'9600000002992',evidenceSha256:'b'.repeat(64),providerReference:'SOL-3144',actorUserId:'forged'}))).status).toBe(200);
  expect(m.auth.mock.calls[0][1]).toEqual(['platform_admin','admin']);
  expect(m.reconcile.mock.calls[0][1]).toBe('session-actor');
 });
 it('returns a conflict while recovery remains unresolved',async()=>{
  m.recover.mockResolvedValue({ok:false,error:'farmalink_recovery_not_confirmed'});
  expect((await recover(context())).status).toBe(409);
 });
});
