import type { APIRoute } from 'astro';
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/api-helpers';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MEMED_HOSTS = new Set(['memed.com.br', 'memed.com']);
const REDIRECT_HOSTS = new Set(['amazonaws.com', 'cloudfront.net', 'googleapis.com']);

type JsonObject = Record<string, unknown>;

interface MemedPrescriptionPdfRow {
  id: string;
  patient_id: string;
  status: string;
  provider_data: unknown;
  digital_link_data: unknown;
  pdf_signature_verified: boolean | null;
  pdf_sha256: string | null;
  pdf_byte_length: number | null;
}

function isMemedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return [...MEMED_HOSTS].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isAllowedProviderHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return isMemedHost(host) ||
    [...REDIRECT_HOSTS].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function findMemedPdfUrl(value: unknown, depth = 0): string | null {
  if (depth > 7 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMemedPdfUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const object = value as JsonObject;
  for (const [key, nested] of Object.entries(object)) {
    if (!/(pdf|document|digital|url|link)/i.test(key) || typeof nested !== 'string') continue;
    try {
      const url = new URL(nested);
      if (url.protocol === 'https:' && isMemedHost(url.hostname)) return url.toString();
    } catch {
      // Ignore malformed provider links.
    }
  }

  for (const nested of Object.values(object)) {
    const found = findMemedPdfUrl(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

async function fetchOfficialPdf(initialUrl: string): Promise<Uint8Array> {
  let current = new URL(initialUrl);

  for (let attempt = 0; attempt <= 3; attempt += 1) {
    if (current.protocol !== 'https:' || !isAllowedProviderHost(current.hostname)) {
      throw new Error('memed_pdf_host_not_allowed');
    }

    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/pdf' },
      signal: AbortSignal.timeout(20_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || attempt === 3) throw new Error('memed_pdf_redirect_invalid');
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) throw new Error('memed_pdf_provider_http_error');
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_PDF_BYTES) throw new Error('memed_pdf_too_large');

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 5 || bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error('memed_pdf_invalid_size');
    }
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
      throw new Error('memed_pdf_invalid_signature');
    }
    return bytes;
  }

  throw new Error('memed_pdf_redirect_limit');
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Patient-scoped proxy; the Memed signed URL is never exposed to the client. */
export const GET: APIRoute = async ({ request, params, locals }) => {
  const routeId = params.id ?? '';
  const rowId = routeId.startsWith('memed-') ? routeId.slice('memed-'.length) : '';
  if (!UUID.test(rowId)) return badRequest('invalid_memed_prescription_id');

  const context = await resolvePatientContext(request, locals);
  if (!context) return unauthorized();

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data, error } = await admin.from('memed_prescriptions')
      .select('id,patient_id,status,provider_data,digital_link_data,pdf_signature_verified,pdf_sha256,pdf_byte_length')
      .eq('id', rowId)
      .maybeSingle();

    if (error) throw error;
    const row = data as MemedPrescriptionPdfRow | null;
    if (!row || row.status === 'deleted') return notFound();
    if (row.patient_id !== context.patientId) return forbidden('prescription_access_denied');
    if (row.pdf_signature_verified !== true) return forbidden('memed_pdf_signature_not_verified');

    const providerUrl = findMemedPdfUrl(row.digital_link_data)
      ?? findMemedPdfUrl(row.provider_data);
    if (!providerUrl) return notFound('memed_pdf_not_available');

    const bytes = await fetchOfficialPdf(providerUrl);
    const actualHash = await sha256Hex(bytes);
    const storedHash = row.pdf_sha256?.toLowerCase() ?? null;

    if (storedHash && storedHash !== actualHash) return forbidden('memed_pdf_integrity_mismatch');
    if (row.pdf_byte_length !== null && row.pdf_byte_length !== bytes.byteLength) {
      return forbidden('memed_pdf_integrity_mismatch');
    }

    if (!storedHash) {
      const { data: pinned, error: pinError } = await admin.from('memed_prescriptions')
        .update({
          pdf_sha256: actualHash,
          pdf_byte_length: bytes.byteLength,
          pdf_integrity_captured_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('patient_id', context.patientId)
        .is('pdf_sha256', null)
        .select('pdf_sha256,pdf_byte_length')
        .maybeSingle();

      if (pinError) throw pinError;
      if (!pinned) {
        const { data: concurrent, error: concurrentError } = await admin.from('memed_prescriptions')
          .select('pdf_sha256,pdf_byte_length')
          .eq('id', row.id)
          .eq('patient_id', context.patientId)
          .maybeSingle();
        if (concurrentError) throw concurrentError;
        if (concurrent?.pdf_sha256 !== actualHash || concurrent?.pdf_byte_length !== bytes.byteLength) {
          return forbidden('memed_pdf_integrity_mismatch');
        }
      }
    }

    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="memed-${row.id}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Content-SHA256': actualHash,
        'X-Content-Length': String(bytes.byteLength),
        'X-PDF-Integrity': 'verified',
      },
    });
  } catch (error) {
    const errorCode = error instanceof Error && /^memed_pdf_[a-z0-9_]+$/.test(error.message)
      ? error.message
      : 'memed_pdf_download_failed';
    logger.error('[patients/memed-prescription-pdf] download failed', { rowId, errorCode });
    return internalError('memed_pdf_download_failed');
  }
};
