/**
 * FirmAR/PFDR callback registered in TAD EX-2026-104186995.
 *
 * GET/HEAD are diagnostic. POST is HARD-GATED until: (1) FirmAR authorizes
 * the integration, (2) an isolated independent PAdES verifier has been
 * deployed and accredited through live homologation fixtures, and (3) an
 * end-to-end review explicitly changes the compile-time gate below.
 *
 * A callback token or redirected user is NEVER evidence of a digital
 * signature. Only a validated PDF, stored privately and atomically finalized
 * in PostgreSQL, may be labelled signed.
 */
import type { APIRoute } from 'astro';
import { serviceUnavailable } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { createFirmArSupabaseReceiptStore } from '@/lib/doctors/services/firmar/firmar-supabase-receipt-store';
import { processVerifiedFirmArCallback } from '@/lib/doctors/services/firmar/firmar-verified-callback-processor';
import { createFirmArIndependentPadesVerifier } from '@/lib/doctors/services/firmar/firmar-independent-pades-client';

// Must remain false until official homologation and independent security
// approval. Environment flags alone cannot override this safety gate.
const VERIFIED_CALLBACK_APPROVED_FOR_LIVE_TRAFFIC = false;
const MAX_CALLBACK_BYTES = 12 * 1024 * 1024;

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Type': 'application/json; charset=utf-8',
};

function config(locals: App.Locals) {
  const vars = (locals.runtime?.env ?? {}) as Record<string, unknown>;
  const get = (name: string): string => {
    const value = vars[name] ?? import.meta.env[name];
    return typeof value === 'string' ? value : '';
  };
  return {
    enabled: get('FIRMAR_ENABLED') === 'true',
    approved: get('FIRMAR_INTEGRATION_APPROVED') === 'true',
    verifierEndpoint: get('FIRMAR_PADES_VERIFIER_URL'),
    verifierToken: get('FIRMAR_PADES_INTERNAL_TOKEN'),
  };
}

async function parseBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new Error('firmar_callback_content_type_invalid');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('firmar_callback_body_missing');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CALLBACK_BYTES) {
        throw new Error('firmar_callback_body_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error('firmar_callback_body_missing');
  const full = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    full.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(full)) as unknown;
}

export const GET: APIRoute = async () => new Response(
  JSON.stringify({
    service: 'autamedica-firmar-callback',
    reachable: true,
    acceptingSignatures: false,
    status: 'pending_verified_signature_pipeline',
  }),
  { status: 200, headers: HEADERS },
);

export const HEAD: APIRoute = async () => new Response(null, {
  status: 200,
  headers: HEADERS,
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!VERIFIED_CALLBACK_APPROVED_FOR_LIVE_TRAFFIC) {
    const response = serviceUnavailable('firmar_verified_callback_not_homologated');
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }

  const cfg = config(locals);
  if (!cfg.enabled || !cfg.approved || !cfg.verifierEndpoint || !cfg.verifierToken) {
    return serviceUnavailable('firmar_integration_pending_authorization');
  }

  try {
    const payload = await parseBoundedJson(request);
    const admin = createAstroAdminClient(locals.runtime?.env);
    const verified = await processVerifiedFirmArCallback({
      payload,
      store: createFirmArSupabaseReceiptStore(admin),
      verifyPades: createFirmArIndependentPadesVerifier({
        endpoint: cfg.verifierEndpoint,
        serviceToken: cfg.verifierToken,
      }),
    });
    return new Response(JSON.stringify({
      status: verified.status,
      certificateId: verified.certificateId,
    }), { status: 200, headers: HEADERS });
  } catch {
    // Fail closed and never disclose patient data, CUIL or verifier details.
    return new Response(JSON.stringify({ error: 'firmar_callback_verification_failed' }),
      { status: 422, headers: HEADERS });
  }
};
