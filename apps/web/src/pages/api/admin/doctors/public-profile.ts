import type { APIRoute } from 'astro';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

export const prerender = false;

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

export const PATCH: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const body = await request.json().catch(() => null) as {
      doctor_id?: string;
      enabled?: boolean;
    } | null;
    if (
      !body
      || typeof body.doctor_id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.doctor_id)
      || typeof body.enabled !== 'boolean'
    ) {
      return response({ error: 'valid_doctor_id_and_enabled_required' }, 400);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAstroAdminClient(locals.runtime?.env) as any;
    const { data, error } = await db
      .from('doctors')
      .update({
        public_profile_enabled: body.enabled,
        public_profile_updated_by: auth.user.id,
      })
      .eq('id', body.doctor_id)
      .select('id,public_profile_enabled,public_profile_published_at,public_profile_updated_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return response({ error: 'doctor_not_found' }, 404);
    // Database trigger writes the visibility audit row and publication timestamp.
    return response({ data });
  } catch (error) {
    logger.error('[api/admin/doctors/public-profile] PATCH failed', error);
    return response({ error: 'profile_visibility_update_failed' }, 503);
  }
};
