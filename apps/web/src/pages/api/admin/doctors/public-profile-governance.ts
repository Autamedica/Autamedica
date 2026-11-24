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

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAstroAdminClient(locals.runtime?.env) as any;
    const { data, error } = await db
      .from('platform_operational_domains')
      .select('scope_key,public_doctor_testimonials_enabled')
      .in('scope_key', ['AR', 'BR']);
    if (error) throw error;

    const flags = { AR: false, BR: false };
    for (const row of data ?? []) {
      if (row.scope_key === 'AR' || row.scope_key === 'BR') {
        flags[row.scope_key] = row.public_doctor_testimonials_enabled === true;
      }
    }
    return response({ data: flags });
  } catch (error) {
    logger.error('[api/admin/doctors/public-profile-governance] GET failed', error);
    return response({ error: 'governance_unavailable' }, 503);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const body = await request.json().catch(() => null) as {
      jurisdiction?: string;
      enabled?: boolean;
      reason?: string;
    } | null;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (
      !body
      || !['AR', 'BR'].includes(body.jurisdiction ?? '')
      || typeof body.enabled !== 'boolean'
      || reason.length < 8
      || reason.length > 500
    ) {
      return response({ error: 'valid_jurisdiction_enabled_and_audit_reason_required' }, 400);
    }

    const db = createAstroAdminClient(locals.runtime?.env) as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
    const { data, error } = await db.rpc('admin_set_public_doctor_testimonials', {
      p_scope_key: body.jurisdiction,
      p_enabled: body.enabled,
      p_reason: reason,
      p_actor_id: auth.user.id,
    });
    if (error) throw error;
    return response({ data });
  } catch (error) {
    logger.error('[api/admin/doctors/public-profile-governance] PATCH failed', error);
    return response({ error: 'governance_update_failed' }, 500);
  }
};
