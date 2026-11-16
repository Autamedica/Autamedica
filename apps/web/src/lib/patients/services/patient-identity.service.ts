import { fetchOfficialIdentity, type OfficialIdentityResult, type RenaperSexId } from '@/lib/interoperability/non-fhir.service';
export type PatientIdentityStatus='unverified'|'pending'|'verified_renaper'|'mismatch'|'not_applicable';
type UpdateResult={error:{message?:string;code?:string}|null};
type UpdateQuery=PromiseLike<UpdateResult>&{eq(column:string,value:string):UpdateQuery};
type IdentityDb={from(table:string):{update(values:Record<string,unknown>):UpdateQuery}};
export interface PersistedOfficialIdentity {identityStatus:PatientIdentityStatus;officialFullName:string|null;officialFirstName:string|null;officialLastName:string|null;dni:string;cuil:string|null;birthDate:string|null;gender:string|null;pucoCoverageName:string|null;pucoCoverageCode:string|null}
const digits=(v:string|null|undefined)=>(v??'').replace(/\D/g,'');
const clean=(v:string|null|undefined)=>v?.trim()||null;
function tokens(v:string){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('es-AR').replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean)}
export function declaredNameMatchesOfficial(declared:string|null|undefined,official:string):boolean{
 if(!declared?.trim())return true;const a=tokens(declared),b=tokens(official);if(!a.length||!b.length)return false;
 return new Set(a.filter(t=>b.includes(t))).size/Math.max(a.length,b.length)>=0.5;
}
function normalizeBirthDate(v:string|null){if(!v)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=/^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(v);return m?`${m[3]}-${m[2]}-${m[1]}`:null}
function normalizeGender(v:string|null){const x=(v??'').trim().toUpperCase();return ['F','FEMENINO','FEMALE'].includes(x)?'F':['M','MASCULINO','MALE'].includes(x)?'M':['X','NO BINARIO','NO_BINARIO'].includes(x)?'X':clean(v)}
export function buildOfficialIdentityRecord(r:OfficialIdentityResult,dni:string,declaredName?:string|null):PersistedOfficialIdentity{
 const p=r.person,first=clean(p.nombres),last=clean(p.apellido),full=[first,last].filter(Boolean).join(' ')||null,cuil=digits(p.cuil).length===11?digits(p.cuil):null,coverage=r.coverages[0]??null;
 const status:PatientIdentityStatus=!full||!cuil?'pending':!declaredNameMatchesOfficial(declaredName,full)?'mismatch':'verified_renaper';
 return {identityStatus:status,officialFullName:full,officialFirstName:first,officialLastName:last,dni:digits(p.numeroDocumento)||digits(dni),cuil,birthDate:normalizeBirthDate(clean(p.fechaNacimiento)),gender:normalizeGender(clean(p.sexo)),pucoCoverageName:clean(coverage?.cobertura),pucoCoverageCode:clean(coverage?.rnos)};
}
export async function persistOfficialIdentityResult(input:{supabase:unknown;result:OfficialIdentityResult;dni:string;patientId?:string|null;dispatchRequestId?:string|null;userId?:string|null;declaredName?:string|null;syncProfileName?:boolean}):Promise<PersistedOfficialIdentity>{
 if(digits(input.result.person.numeroDocumento)!==digits(input.dni))throw Object.assign(new Error('RENAPER document mismatch'),{code:'RENAPER_DOCUMENT_MISMATCH'});
 const v=buildOfficialIdentityRecord(input.result,input.dni,input.declaredName),db=input.supabase as IdentityDb;
 const fields={identity_status:v.identityStatus,official_full_name:v.officialFullName,official_first_name:v.officialFirstName,official_last_name:v.officialLastName,official_cuil:v.cuil,official_birth_date:v.birthDate,official_gender:v.gender,puco_coverage_name:v.pucoCoverageName,puco_coverage_code:v.pucoCoverageCode,identity_verified_at:v.identityStatus==='verified_renaper'?new Date().toISOString():null,identity_source:'msal_bus_renaper'};
 if(input.patientId){const {error}=await db.from('patients').update({...fields,dni:v.dni,cuil:v.cuil,birth_date:v.birthDate,gender:v.gender==='F'?'female':v.gender==='M'?'male':v.gender==='X'?'other':null}).eq('id',input.patientId);if(error)throw error}
 if(input.dispatchRequestId){const {error}=await db.from('pharmacy_dispatch_requests').update({...fields,patient_dni:v.dni}).eq('id',input.dispatchRequestId);if(error)throw error}
 if(input.syncProfileName&&input.userId&&v.identityStatus==='verified_renaper'&&v.officialFirstName&&v.officialLastName){const {error}=await db.from('profiles').update({first_name:v.officialFirstName,last_name:v.officialLastName}).eq('user_id',input.userId);if(error)throw error}
 return v;
}
export async function fetchAndPersistOfficialIdentity(input:{supabase:unknown;dni:string;sexId:RenaperSexId;patientId?:string|null;dispatchRequestId?:string|null;userId?:string|null;declaredName?:string|null;runtimeEnv?:Record<string,unknown>;timeoutMs?:number}):Promise<PersistedOfficialIdentity|null>{
 const lookup=fetchOfficialIdentity({dni:digits(input.dni),sexId:input.sexId,runtimeEnv:input.runtimeEnv});let timer:ReturnType<typeof setTimeout>|undefined;
 try{const timeout=new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),input.timeoutMs??10000)});const result=await Promise.race([lookup,timeout]);if(!result)return null;return await persistOfficialIdentityResult({...input,result})}
 finally{if(timer)clearTimeout(timer)}
}