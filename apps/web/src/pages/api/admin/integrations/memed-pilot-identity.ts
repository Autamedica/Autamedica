import type { APIRoute } from 'astro';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk, serviceUnavailable } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { storeMemedDoctorCpf } from '@/lib/prescriptions/brazil/memed-identity.repository';
import { validCpf } from '@/lib/prescriptions/brazil/memed-patient';

export const prerender = false;

/** Admin Módulo 1: stores the physician-supplied CPF only in the private Memed identity table. */
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return badRequest('request_too_large');
    body = JSON.parse(raw);
  } catch {
    return badRequest('invalid_json');
  }
  const cpf = body && typeof body === 'object' && 'cpf' in body
    ? (body as { cpf?: unknown }).cpf : null;
  if (typeof cpf !== 'string' || !validCpf(cpf)) return badRequest('memed_doctor_cpf_invalid');

  const pilotId = locals.runtime?.env?.MEMED_PILOT_DOCTOR_ID;
  if (typeof pilotId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pilotId)) {
    return serviceUnavailable('memed_pilot_not_configured');
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: doctor, error } = await admin.from('doctors')
      .select('id, active, care_country, license_type')
      .eq('id', pilotId).maybeSingle();
    if (error) return internalError('memed_pilot_lookup_failed');
    if (!doctor?.active || doctor.care_country !== 'BR' || doctor.license_type !== 'CRM') {
      return forbidden('active_brazilian_pilot_required');
    }
    await storeMemedDoctorCpf(admin, pilotId, cpf.replace(/\D/g, ''));
    const response = jsonOk({ saved: true, destination: 'memed_private_identity' });
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'memed_private_identity_conflict') return conflictResponse();
    return internalError('memed_private_identity_persistence_failed');
  }
};

function conflictResponse(): Response {
  return new Response(JSON.stringify({ success: false, error: { message: 'memed_private_identity_already_set' } }), {
    status: 409, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private' },
  });
}
