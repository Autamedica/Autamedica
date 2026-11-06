/**
 * Prescri BR sandbox adapter. It NEVER accepts production credentials or patient input.
 * Provider contract: https://www.prescri.com.br/openapi.json (v1.3.0).
 * Only synthetic, non-clinical documents. No SNCR, delivery, webhooks or real signatures.
 */
export const PRESCRI_SANDBOX_BASE = 'https://suykokupoevtdfalrzue.supabase.co/functions/v1';
export const PRESCRI_DEMO_EXTERNAL_ID = 'autamedica-br-prescri-api-sandbox-pdf-v1';
export const PRESCRI_DEMO_IDEMPOTENCY_KEY = PRESCRI_DEMO_EXTERNAL_ID;

const ALLOWED_PATHS = new Set([
  '/api-signatures-create',
  '/api-signatures-get',
  '/api-signatures-pdf',
  '/api-document-types',
]);

export interface PrescriSandboxCredentials {
  key: string;
  secret: string;
}

export interface PrescriSandboxSignature {
  signature_id: string;
  status: string;
  external_id?: string;
  sandbox: boolean;
  cryptographically_signed: boolean;
}

export interface PrescriSandboxPdf {
  bytes: Uint8Array;
  sha256: string;
}

export function assertTestCredentials(credentials: PrescriSandboxCredentials): void {
  if (!credentials.key.startsWith('pk_test_') ||
    !credentials.secret.startsWith('sk_test_') ||
    credentials.key.length <= 8 || credentials.secret.length <= 8) {
    throw new Error('prescri_test_credentials_required');
  }
}

export function demoDocumentPayload() {
  return {
    provider: 'birdid',
    doctor_cpf: '00000000000',
    doctor_full_name: 'Medico Ficticio AUTAMEDICA DEMO',
    document_type: 'Receituário Médico',
    external_id: PRESCRI_DEMO_EXTERNAL_ID,
    idempotency_by_external_id: true,
    idempotency_key: PRESCRI_DEMO_IDEMPOTENCY_KEY,
    patient: {
      full_name: 'Paciente Ficticio AUTAMEDICA DEMO',
      cpf: '00000000000',
    },
    document: {
      title: 'DOCUMENTO DE HOMOLOGACAO - SEM VALIDADE CLINICA',
      body: 'Documento inteiramente ficticio para teste de API. Nao prescrever, assinar, dispensar ou utilizar como receita medica.',
    },
    delivery: { whatsapp: false, email: false },
  };
}

export async function providerFetch(
  credentials: PrescriSandboxCredentials,
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  assertTestCredentials(credentials);
  const url = new URL(path, PRESCRI_SANDBOX_BASE + '/');
  if (url.origin !== 'https://suykokupoevtdfalrzue.supabase.co' ||
      !url.pathname.startsWith('/functions/v1/') ||
      !ALLOWED_PATHS.has(url.pathname.slice('/functions/v1'.length))) {
    throw new Error('prescri_endpoint_not_allowlisted');
  }
  return fetcher(url, {
    ...init,
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'X-API-Key': credentials.key,
      'X-API-Secret': credentials.secret,
      'Accept': path.startsWith('/api-signatures-pdf') ? 'application/pdf' : 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

async function jsonResult(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error('prescri_provider_http_' + response.status);
  const json = await response.json().catch(() => null);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('prescri_provider_invalid_json');
  }
  return json as Record<string, unknown>;
}

function assertSandboxSignature(value: Record<string, unknown>): PrescriSandboxSignature {
  if (value.sandbox !== true || value.cryptographically_signed !== false) {
    throw new Error('prescri_sandbox_attestation_missing');
  }
  const id = value.signature_id;
  if (typeof id !== 'string' || !/^test_sig_[A-Za-z0-9_-]{1,160}$/.test(id)) {
    throw new Error('prescri_sandbox_signature_id_invalid');
  }
  if (typeof value.status !== 'string') throw new Error('prescri_signature_status_invalid');
  return {
    signature_id: id,
    status: value.status,
    external_id: typeof value.external_id === 'string' ? value.external_id : undefined,
    sandbox: true,
    cryptographically_signed: false,
  };
}

export async function createPrescriDemo(
  credentials: PrescriSandboxCredentials,
  fetcher: typeof fetch = fetch,
): Promise<PrescriSandboxSignature> {
  const response = await providerFetch(credentials, '/api-signatures-create', {
    method: 'POST',
    headers: { 'Idempotency-Key': PRESCRI_DEMO_IDEMPOTENCY_KEY },
    body: JSON.stringify(demoDocumentPayload()),
  }, fetcher);
  return assertSandboxSignature(await jsonResult(response));
}

export async function getPrescriDemo(
  credentials: PrescriSandboxCredentials,
  id?: string,
  fetcher: typeof fetch = fetch,
): Promise<PrescriSandboxSignature> {
  if (id && !/^test_sig_[A-Za-z0-9_-]{1,160}$/.test(id)) {
    throw new Error('prescri_sandbox_signature_id_invalid');
  }
  const params = new URLSearchParams(id
    ? { id }
    : { external_id: PRESCRI_DEMO_EXTERNAL_ID });
  const response = await providerFetch(
    credentials, '/api-signatures-get?' + params.toString(), {}, fetcher,
  );
  const result = assertSandboxSignature(await jsonResult(response));
  if (result.external_id !== PRESCRI_DEMO_EXTERNAL_ID) {
    throw new Error('prescri_sandbox_external_id_mismatch');
  }
  return result;
}

export async function downloadPrescriDemoPdf(
  credentials: PrescriSandboxCredentials,
  fetcher: typeof fetch = fetch,
): Promise<PrescriSandboxPdf> {
  // Resolve the immutable synthetic external_id to prevent disclosure of other documents.
  const signature = await getPrescriDemo(credentials, undefined, fetcher);
  if (signature.status !== 'signed') throw new Error('prescri_sandbox_pdf_not_ready');
  const query = new URLSearchParams({ id: signature.signature_id });
  const response = await providerFetch(
    credentials, '/api-signatures-pdf?' + query.toString(), {}, fetcher,
  );
  if (!response.ok) throw new Error('prescri_provider_pdf_http_' + response.status);
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/pdf')) {
    throw new Error('prescri_provider_pdf_wrong_content_type');
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 8_000_000) throw new Error('prescri_provider_pdf_too_large');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 100 || bytes.byteLength > 8_000_000) {
    throw new Error('prescri_provider_pdf_invalid_size');
  }
  const header = new TextDecoder('ascii').decode(bytes.slice(0, 5));
  const end = new TextDecoder('ascii').decode(bytes.slice(-2048));
  if (header !== '%PDF-' || !end.includes('%%EOF')) {
    throw new Error('prescri_provider_pdf_invalid');
  }
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((n) => n.toString(16).padStart(2, '0')).join('');
  return { bytes, sha256 };
}

export async function getPrescriSandboxDocumentTypes(
  credentials: PrescriSandboxCredentials,
  fetcher: typeof fetch = fetch,
): Promise<{ name: string; requires_sncr: boolean }[]> {
  const response = await providerFetch(credentials, '/api-document-types', {}, fetcher);
  const json = await jsonResult(response);
  const list = Array.isArray(json.document_types) ? json.document_types : [];
  return list.map((entry) => {
    const obj = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    return { name: String(obj.name ?? ''), requires_sncr: obj.requires_sncr === true };
  }).filter((entry) => entry.name.length > 0);
}
