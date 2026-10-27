/**
 * FirmAR/PFDR callback registered in TAD file EX-2026-104186995.
 *
 * Diagnostic GET/HEAD are available before homologation. POST deliberately
 * fails closed: neither a callback token nor a user redirect authenticates
 * a digital signature. Enable receipt only after independent PAdES validation,
 * audit and atomic, idempotent DB finalization are implemented.
 */
import type { APIRoute } from 'astro';
import { serviceUnavailable } from '@/lib/api-helpers';

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export const GET: APIRoute = async () => new Response(
  JSON.stringify({
    service: 'autamedica-firmar-callback',
    reachable: true,
    acceptingSignatures: false,
    status: 'pending_verified_signature_pipeline',
  }),
  { status: 200, headers: { ...HEADERS, 'Content-Type': 'application/json' } },
);

export const HEAD: APIRoute = async () => new Response(null, {
  status: 200,
  headers: HEADERS,
});

export const POST: APIRoute = async () => {
  const response = serviceUnavailable('firmar_verified_callback_not_implemented');
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
};
