/**
 * Memed HOMOLOGATION evidence checker. Read-only, strictly no prescription
 * creation, no signature, no patient/doctor PII and no provider tokens in logs.
 * Uses the AutaMedica-only synthetic doctor and patient IDs, never production.
 * "Found PDF" does NOT mean a legally signed prescription.
 */
import { createHash } from 'node:crypto';

const BASE = 'https://integrations.api.memed.com.br/v1';
const DOCS = 'https://doc.memed.com.br/docs/primeiros-passos/';
const DOCTOR = {
  externalId: 'autamedica-homologacao-demo-proprio-20261103-01',
  cpf: '92716031410',
  crm: '99091103', uf: 'RS',
};
const PATIENT_EXTERNAL_ID = 'autamedica-homologacao-paciente-demo-20261103-01';
const results = {
  environment: 'Memed homologation only',
  productionContacted: false,
  physicianIdentityMatched: false,
  historyHttpStatus: null,
  doctorHistoryCount: null,
  patientDemoPrescriptionFound: false,
  providerPrescriptionIdVerified: false,
  digitalLinkHttpStatus: null,
  pdfEndpointHttpStatus: null,
  pdfBytesVerified: false,
  pdfFingerprint: null,
  cryptographicSignatureVerified: false,
  completed: false,
  errorCode: null,
};

async function get(url, headers = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'integrations.api.memed.com.br') {
    throw new Error('non_homologation_url_blocked');
  }
  return fetch(parsed, {
    method: 'GET',
    redirect: 'error', referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/vnd.api+json', ...headers },
    signal: AbortSignal.timeout(20000),
  });
}
async function asJson(response) {
  try { return await response.json(); } catch { return null; }
}
function query(path, paramName, paramValue) {
  const u = new URL(BASE + path);
  u.searchParams.set(paramName, paramValue);
  return u.toString();
}
function providerId(data) {
  const raw = data?.id ?? data?.attributes?.id ?? null;
  const id = raw === null || raw === undefined ? '' : String(raw);
  return /^[a-zA-Z0-9-]{1,80}$/.test(id) ? id : null;
}
function matchesPatient(data) {
  const attr = data?.attributes ?? data;
  return [
    attr?.paciente?.external_id,
    attr?.prescricao?.paciente?.external_id,
    attr?.patient?.external_id,
    attr?.prescricao?.paciente?.idExterno,
  ].includes(PATIENT_EXTERNAL_ID);
}
function downloadUrlFromJson(data) {
  const attr = data?.data?.attributes ?? data?.attributes ?? data?.data ?? data;
  return [attr?.url, attr?.pdf_url, attr?.url_document, attr?.urlDocument, attr?.link]
    .find(x => typeof x === 'string' && x.startsWith('https://')) ?? null;
}
async function pdfCheck(response, depth = 0) {
  if (depth > 2) return false;
  const mime = response.headers.get('content-type') ?? '';
  if (mime.includes('application/pdf')) {
    const size = Number(response.headers.get('content-length') ?? 0);
    if (size > 4000000) return false;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 800 || bytes.length > 4000000 || bytes.subarray(0,5).toString() !== '%PDF-') return false;
    results.pdfBytesVerified = true;
    results.pdfFingerprint = createHash('sha256').update(bytes).digest('hex').slice(0,16);
    return true;
  }
  const data = await asJson(response);
  const link = downloadUrlFromJson(data);
  if (!link) return false;
  const url = new URL(link);
  // Never follow an arbitrary host provided by a remote JSON response.
  if (url.protocol !== 'https:' ||
      !(url.hostname === 'memed.com.br' || url.hostname.endsWith('.memed.com.br'))) return false;
  const res = await fetch(url, { redirect: 'error', referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000) });
  if (!res.ok) return false;
  return pdfCheck(res, depth + 1);
}
async function run() {
  const doc = await fetch(DOCS, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!doc.ok) throw new Error('official_test_docs_unavailable');
  const html = await doc.text();
  const key = html.match(/iJGiB4[A-Za-z0-9]{50}/)?.[0];
  const secret = html.match(/Xe8M5Gv[A-Za-z0-9]{49}/)?.[0];
  if (!key || !secret) throw new Error('official_test_keys_not_found');
  const lookup = new URL(BASE + '/sinapse-prescricao/usuarios/' + DOCTOR.cpf);
  lookup.searchParams.set('api-key', key);
  lookup.searchParams.set('secret-key', secret);
  const dr = await get(lookup);
  if (!dr.ok) throw new Error('sandbox_prescriber_lookup_unavailable');
  const attrs = (await asJson(dr))?.data?.attributes;
  const board = attrs?.board;
  results.physicianIdentityMatched = attrs?.external_id === DOCTOR.externalId
    && attrs?.cpf === DOCTOR.cpf
    && String(board?.board_number) === DOCTOR.crm
    && String(board?.board_state).toUpperCase() === DOCTOR.uf
    && String(board?.board_code).toUpperCase() === 'CRM'
    && typeof attrs?.token === 'string' && attrs.token.length > 0;
  if (!results.physicianIdentityMatched) throw new Error('sandbox_doctor_identity_mismatch');
  const token = attrs.token;
  const hist = await get(query('/prescricoes','token',token));
  results.historyHttpStatus = hist.status;
  if (!hist.ok) throw new Error('sandbox_history_unavailable');
  const data = (await asJson(hist))?.data;
  if (!Array.isArray(data)) throw new Error('sandbox_history_response_invalid');
  results.doctorHistoryCount = data.length;
  for (const record of data.slice(0,10)) {
    const id = providerId(record);
    if (!id) continue;
    let ownPatient = matchesPatient(record);
    if (!ownPatient) {
      const detail = await get(query('/prescricoes/' + id, 'token',token), { 'Content-Type':'application/json' });
      if (detail.ok) ownPatient = matchesPatient((await asJson(detail))?.data);
    }
    if (!ownPatient) continue;
    results.patientDemoPrescriptionFound = true;
    results.providerPrescriptionIdVerified = true;
    const link = await get(query('/prescricoes/' + id + '/get-digital-prescription-link', 'token',token));
    results.digitalLinkHttpStatus = link.status;
    const pdf = await get(query('/prescricoes/' + id + '/url-document/full','token',token));
    results.pdfEndpointHttpStatus = pdf.status;
    if (pdf.ok) await pdfCheck(pdf);
    break;
  }
  results.completed = results.patientDemoPrescriptionFound
    && results.providerPrescriptionIdVerified && results.pdfBytesVerified;
}
try { await run(); }
catch (error) {
  const code = error instanceof Error ? error.message : '';
  results.errorCode = /^(official_|sandbox_|non_homologation_url_blocked)/.test(code)
    ? code : 'provider_or_network_failure';
}
console.log(JSON.stringify(results, null, 2));
if (results.errorCode) process.exitCode = 1;
